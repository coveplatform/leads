import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/client";
import {
  buildCard,
  getCatalogue,
  recordingLabelId,
  recordingPeople,
  type Catalogue,
} from "@/lib/catalogue/graph";
import { ApiError } from "@/lib/api/errors";
import {
  emptySession,
  nextDigCandidates,
  SIGNALS,
  type RankContext,
  type SessionState,
  type StableTaste,
} from "@/lib/ranking";
import type {
  DigDistance,
  DigMode,
  RecommendationExplanation,
  RecordCard,
  Suggestion,
  WrongDirectionReason,
} from "@/domain/types";
import { loadStableTaste, recordStableSignal } from "@/features/taste/service";
import { keepRecording } from "@/features/crates/service";
import { DEMO_SCENES } from "@/data/demo-catalogue";
import { playerConfigForSource } from "@/lib/providers/player";
import { stableId } from "@/lib/db/ids";

type Row = Record<string, unknown>;

export interface QueuedCandidate {
  candidateId: string;
  recordingId: string;
  viaEdgeId: string | null;
  explanation: RecommendationExplanation;
  score: number;
}
interface Queue {
  mode: DigMode;
  distance: DigDistance;
  candidates: QueuedCandidate[];
  /** candidateIds already turned into trail nodes */
  consumed: string[];
}
interface CandidateState extends SessionState {
  queues: Record<string, Queue>;
}

export interface TrailNode {
  id: string;
  parentId: string | null;
  recordingId: string;
  depth: number;
  position: number;
  branchMode: DigMode | null;
  explanation: RecommendationExplanation | null;
  outcome: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  seedType: string;
  seedRecordingId: string | null;
  seedUrl: string | null;
  mode: DigMode;
  distance: DigDistance;
  status: string;
  currentNodeId: string | null;
  forkedFromSessionId: string | null;
  startedAt: string;
  lastActivityAt: string;
  stats: { considered: number; saved: number; branches: number; modesUsed: DigMode[] };
  seedCard: RecordCard | null;
}

export interface DigState {
  session: SessionSummary;
  current: {
    node: TrailNode;
    card: RecordCard;
    player: ReturnType<typeof playerConfigForSource>;
  } | null;
  trail: TrailNode[];
  suggestions: Suggestion[];
  queue: { mode: DigMode; distance: DigDistance; remaining: number } | null;
  lastGoodNodeId: string | null;
  nudge: string | null;
  sessionNote: string | null;
  changed?: string[];
  exhausted?: boolean;
}

const PAGE = 10;
const POOL = 60;

async function loadState(db: Db, sessionId: string): Promise<CandidateState> {
  const r = await db.query<{ candidate_state: CandidateState | string }>(
    "SELECT candidate_state FROM session_filters WHERE session_id = $1",
    [sessionId],
  );
  const raw = r.rows[0]?.candidate_state;
  const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as
    Partial<CandidateState> | undefined;
  return { ...emptySession(""), queues: {}, ...(parsed ?? {}) } as CandidateState;
}

async function saveState(
  db: Db,
  sessionId: string,
  state: CandidateState,
  lastGoodNodeId?: string | null,
): Promise<void> {
  const rejected = JSON.stringify(state.rejectedEdgeTypes);
  const rejectedTags = JSON.stringify(state.rejectedTags);
  await db.query(
    `UPDATE session_filters SET candidate_state = $2::jsonb, rejected_edge_types = $3::jsonb, rejected_tags = $4::jsonb, updated_at = now()
       ${lastGoodNodeId !== undefined ? ", last_good_node_id = $5" : ""} WHERE session_id = $1`,
    lastGoodNodeId !== undefined
      ? [sessionId, JSON.stringify(state), rejected, rejectedTags, lastGoodNodeId]
      : [sessionId, JSON.stringify(state), rejected, rejectedTags],
  );
}

function nodeFromRow(r: Row): TrailNode {
  const ex = r.explanation;
  return {
    id: String(r.id),
    parentId: (r.parent_node_id as string | null) ?? null,
    recordingId: String(r.entity_id),
    depth: Number(r.depth),
    position: Number(r.position),
    branchMode: (r.branch_mode as DigMode | null) ?? null,
    explanation: (typeof ex === "string" ? JSON.parse(ex) : ex) as RecommendationExplanation | null,
    outcome: String(r.outcome),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

async function requireSession(db: Db, principalId: string, sessionId: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) throw new ApiError("NOT_FOUND", "No such dig");
  const r = await db.query<Row>(
    "SELECT * FROM dig_sessions WHERE id = $1 AND status <> 'deleted'",
    [sessionId],
  );
  const s = r.rows[0];
  if (!s) throw new ApiError("NOT_FOUND", "No such dig");
  if (String(s.principal_id) !== principalId)
    throw new ApiError("FORBIDDEN", "That dig belongs to someone else");
  return s;
}

async function summarise(db: Db, cat: Catalogue, s: Row): Promise<SessionSummary> {
  const id = String(s.id);
  const stats = await db.query<{ considered: string; branches: string; modes: string[] | null }>(
    `SELECT count(*)::text AS considered,
            count(DISTINCT parent_node_id)::text AS branches,
            array_remove(array_agg(DISTINCT branch_mode), NULL) AS modes
       FROM trail_nodes WHERE session_id = $1`,
    [id],
  );
  const saved = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM trail_nodes WHERE session_id = $1 AND outcome IN ('kept','loved')`,
    [id],
  );
  const seedId = (s.seed_id as string | null) ?? null;
  return {
    id,
    title: String(s.title),
    seedType: String(s.seed_type),
    seedRecordingId: seedId,
    seedUrl: (s.seed_url as string | null) ?? null,
    mode: s.mode as DigMode,
    distance: s.discovery_distance as DigDistance,
    status: String(s.status),
    currentNodeId: (s.current_node_id as string | null) ?? null,
    forkedFromSessionId: (s.forked_from_session_id as string | null) ?? null,
    startedAt: new Date(String(s.started_at)).toISOString(),
    lastActivityAt: new Date(String(s.last_activity_at)).toISOString(),
    stats: {
      considered: Number(stats.rows[0]?.considered ?? 0),
      saved: Number(saved.rows[0]?.n ?? 0),
      branches: Number(stats.rows[0]?.branches ?? 0),
      modesUsed: (stats.rows[0]?.modes ?? []) as DigMode[],
    },
    seedCard: seedId ? buildCard(cat, seedId) : null,
  };
}

async function event(
  db: Db,
  principalId: string,
  sessionId: string,
  type: string,
  extra: {
    nodeId?: string | null;
    candidateId?: string | null;
    reason?: string | null;
    idempotencyKey?: string | null;
    meta?: Record<string, unknown>;
  } = {},
): Promise<string | null> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO discovery_events (principal_id, session_id, trail_node_id, candidate_id, event_type, reason_code, idempotency_key, event_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
    [
      principalId,
      sessionId,
      extra.nodeId ?? null,
      extra.candidateId ?? null,
      type,
      extra.reason ?? null,
      extra.idempotencyKey ?? null,
      JSON.stringify(extra.meta ?? {}),
    ],
  );
  return r.rows[0]?.id ?? null;
}

function rankCtx(
  current: string,
  mode: DigMode,
  distance: DigDistance,
  state: SessionState,
  taste: StableTaste,
  includeTrace: boolean,
): RankContext {
  return {
    currentRecordingId: current,
    mode,
    distance,
    session: state,
    taste,
    pageSize: PAGE,
    poolSize: POOL,
    includeTrace,
  };
}

function toQueue(mode: DigMode, distance: DigDistance, suggestions: Suggestion[]): Queue {
  return {
    mode,
    distance,
    consumed: [],
    candidates: suggestions.map((s) => ({
      candidateId: s.candidateId,
      recordingId: s.card.recording.id,
      viaEdgeId: s.viaEdgeId,
      explanation: s.explanation,
      score: s.score,
    })),
  };
}

function suggestionsFromQueue(
  cat: Catalogue,
  q: Queue | undefined,
  trace?: Map<string, Record<string, number>>,
): Suggestion[] {
  if (!q) return [];
  const out: Suggestion[] = [];
  for (const c of q.candidates) {
    if (q.consumed.includes(c.candidateId)) continue;
    const card = buildCard(cat, c.recordingId);
    if (!card) continue;
    out.push({
      candidateId: c.candidateId,
      card,
      explanation: c.explanation,
      score: c.score,
      viaEdgeId: c.viaEdgeId,
      scoreDebugAvailable: Boolean(trace),
      ...(trace?.get(c.recordingId) ? { trace: trace.get(c.recordingId) } : {}),
    });
  }
  return out;
}

function bumpAffinity(
  cat: Catalogue,
  state: SessionState,
  recordingId: string,
  amount: number,
): void {
  for (const t of cat.recordingTags.get(recordingId) ?? [])
    state.tagAffinity[t] = clamp((state.tagAffinity[t] ?? 0) + amount * 0.5);
  for (const a of recordingPeople(cat, recordingId))
    state.artistAffinity[a] = clamp((state.artistAffinity[a] ?? 0) + amount);
  const l = recordingLabelId(cat, recordingId);
  if (l) state.labelAffinity[l] = clamp((state.labelAffinity[l] ?? 0) + amount * 0.6);
}
const clamp = (x: number) => Math.max(-1, Math.min(1, x));

async function addNode(
  db: Db,
  sessionId: string,
  parent: TrailNode | null,
  recordingId: string,
  explanation: RecommendationExplanation | null,
  mode: DigMode | null,
  viaEdgeId: string | null,
): Promise<TrailNode> {
  const pos = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM trail_nodes WHERE session_id = $1 AND parent_node_id IS NOT DISTINCT FROM $2",
    [sessionId, parent?.id ?? null],
  );
  const r = await db.query<Row>(
    `INSERT INTO trail_nodes (session_id, parent_node_id, entity_type, entity_id, depth, via_edge_id, explanation, branch_mode, position)
     VALUES ($1,$2,'recording',$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
    [
      sessionId,
      parent?.id ?? null,
      recordingId,
      (parent?.depth ?? -1) + 1,
      viaEdgeId && /^[0-9a-f-]{36}$/.test(viaEdgeId) ? viaEdgeId : null,
      explanation ? JSON.stringify(explanation) : null,
      mode,
      Number(pos.rows[0]?.n ?? 0),
    ],
  );
  return nodeFromRow(r.rows[0]!);
}

async function setCurrent(db: Db, sessionId: string, nodeId: string): Promise<void> {
  await db.query(
    "UPDATE dig_sessions SET current_node_id = $2, last_activity_at = now() WHERE id = $1",
    [sessionId, nodeId],
  );
}

async function getNode(
  db: Db,
  sessionId: string,
  nodeId: string | null,
): Promise<TrailNode | null> {
  if (!nodeId) return null;
  const r = await db.query<Row>("SELECT * FROM trail_nodes WHERE id = $1 AND session_id = $2", [
    nodeId,
    sessionId,
  ]);
  return r.rows[0] ? nodeFromRow(r.rows[0]) : null;
}

async function trailOf(db: Db, sessionId: string): Promise<TrailNode[]> {
  const r = await db.query<Row>(
    "SELECT * FROM trail_nodes WHERE session_id = $1 ORDER BY created_at, position",
    [sessionId],
  );
  return r.rows.map(nodeFromRow);
}

/** Build (or rebuild) the queue hanging off `node` for a mode/distance. */
function regenerate(
  cat: Catalogue,
  state: CandidateState,
  node: TrailNode,
  mode: DigMode,
  distance: DigDistance,
  taste: StableTaste,
  trace: boolean,
) {
  const result = nextDigCandidates(
    cat,
    rankCtx(node.recordingId, mode, distance, state, taste, trace),
  );
  state.queues[node.id] = toQueue(mode, distance, result.suggestions);
  const traceMap = trace
    ? new Map(result.suggestions.map((s) => [s.card.recording.id, s.trace ?? {}]))
    : undefined;
  return { result, traceMap };
}

export interface SeedInput {
  type: "recording" | "scene" | "url";
  id?: string;
  slug?: string;
  url?: string;
}

export async function listScenes(db: Db) {
  const cat = await getCatalogue(db);
  return DEMO_SCENES.map((s) => {
    const set = [...cat.curations.values()].find((c) => c.slug === s.curation);
    const first = set?.items[0];
    return {
      slug: s.slug,
      title: s.title,
      blurb: s.blurb,
      count: set?.items.length ?? 0,
      sampleCard: first ? buildCard(cat, first) : null,
    };
  });
}

export async function seedRoutes(db: Db) {
  const cat = await getCatalogue(db);
  const r = await db.query<Row>("SELECT * FROM curation_sets WHERE is_seed_route ORDER BY title");
  return r.rows.map((row) => {
    const set = cat.curations.get(String(row.id));
    return {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      description: (row.description as string | null) ?? null,
      curator: String(row.curator),
      items: (set?.items ?? []).map((i) => buildCard(cat, i)).filter(Boolean),
    };
  });
}

export async function createDig(
  db: Db,
  principalId: string,
  input: { seed: SeedInput; mode: DigMode; distance: DigDistance; title?: string },
  opts: { debug?: boolean } = {},
): Promise<DigState> {
  const cat = await getCatalogue(db);
  let seedRecording: string | null = null;
  let seedUrl: string | null = null;
  let seedType: "recording" | "scene" | "url" = input.seed.type;
  if (input.seed.type === "recording") {
    if (!input.seed.id || !cat.recordings.has(input.seed.id))
      throw new ApiError("NOT_FOUND", "Unknown recording");
    seedRecording = input.seed.id;
  } else if (input.seed.type === "scene") {
    const scene = DEMO_SCENES.find((s) => s.slug === input.seed.slug);
    const set = scene
      ? [...cat.curations.values()].find((c) => c.slug === scene.curation)
      : undefined;
    if (!scene || !set?.items[0]) throw new ApiError("NOT_FOUND", "Unknown scene");
    // Deterministic per principal so two people get different doors into the same scene.
    const idx =
      parseInt(stableId("scene-seed", `${principalId}:${scene.slug}`).slice(0, 8), 16) %
      set.items.length;
    seedRecording = set.items[idx] ?? set.items[0];
    seedType = "scene";
  } else {
    // URL seeds must have been resolved via /imports first (status identified).
    const imp = await db.query<Row>(
      "SELECT * FROM imports WHERE principal_id = $1 AND normalized_url = $2 AND status = 'identified' ORDER BY created_at DESC LIMIT 1",
      [principalId, input.seed.url ?? ""],
    );
    const row = imp.rows[0];
    if (!row?.resolved_entity_id || !cat.recordings.has(String(row.resolved_entity_id))) {
      throw new ApiError(
        "NO_CANDIDATES",
        "That link isn't matched to a record in the catalogue yet. Confirm it in Imports or search instead.",
      );
    }
    seedRecording = String(row.resolved_entity_id);
    seedUrl = String(row.normalized_url);
  }
  const card = buildCard(cat, seedRecording!)!;
  const title = input.title ?? `${card.artist?.name ?? "Unknown"} – ${card.recording.title}`;
  const s = await db.query<Row>(
    `INSERT INTO dig_sessions (principal_id, seed_type, seed_id, seed_url, title, mode, discovery_distance) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [principalId, seedType, seedRecording, seedUrl, title, input.mode, input.distance],
  );
  const session = s.rows[0]!;
  const sessionId = String(session.id);
  const root = await addNode(db, sessionId, null, seedRecording!, null, null, null);
  const state: CandidateState = { ...emptySession(seedRecording!), queues: {} };
  const taste = await loadStableTaste(db, principalId);
  regenerate(cat, state, root, input.mode, input.distance, taste, Boolean(opts.debug));
  await db.query(
    `INSERT INTO session_filters (session_id, candidate_state, seed_anchor, last_good_node_id) VALUES ($1,$2::jsonb,$3,$4)`,
    [sessionId, JSON.stringify(state), seedRecording, root.id],
  );
  await setCurrent(db, sessionId, root.id);
  await event(db, principalId, sessionId, "dig_started", {
    nodeId: root.id,
    meta: { seed_type: seedType, mode: input.mode, distance: input.distance, is_guest: true },
  });
  return getDig(db, principalId, sessionId, opts);
}

export async function getDig(
  db: Db,
  principalId: string,
  sessionId: string,
  opts: { debug?: boolean } = {},
): Promise<DigState> {
  const cat = await getCatalogue(db);
  const s = await requireSession(db, principalId, sessionId);
  const state = await loadState(db, sessionId);
  const current = await getNode(db, sessionId, (s.current_node_id as string | null) ?? null);
  const trail = await trailOf(db, sessionId);
  const filters = await db.query<Row>(
    "SELECT last_good_node_id FROM session_filters WHERE session_id = $1",
    [sessionId],
  );
  // A freshly chosen record has no queue of its own until Dig deeper; show
  // the fork it came from (its remaining siblings) so resume restores context.
  const q = current
    ? (state.queues[current.id] ?? (current.parentId ? state.queues[current.parentId] : undefined))
    : undefined;
  const card = current ? buildCard(cat, current.recordingId) : null;
  return {
    session: await summarise(db, cat, s),
    current:
      current && card ? { node: current, card, player: playerConfigForSource(card.source) } : null,
    trail,
    suggestions: suggestionsFromQueue(cat, q),
    queue: q
      ? { mode: q.mode, distance: q.distance, remaining: q.candidates.length - q.consumed.length }
      : null,
    lastGoodNodeId: (filters.rows[0]?.last_good_node_id as string | null) ?? null,
    nudge:
      state.consecutivePasses >= 3
        ? "Three passes in a row. Try another kind of connection, or jump back to your last good record."
        : null,
    sessionNote: null,
    ...(opts.debug ? { debug: { state } } : {}),
  };
}

export async function listDigs(
  db: Db,
  principalId: string,
  opts: { limit?: number; cursor?: string | null; includeArchived?: boolean } = {},
) {
  const cat = await getCatalogue(db);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const params: unknown[] = [principalId, limit + 1];
  let where = "principal_id = $1 AND status <> 'deleted'";
  if (!opts.includeArchived) where += " AND status = 'active'";
  if (opts.cursor) {
    params.push(opts.cursor);
    where += ` AND last_activity_at < $${params.length}`;
  }
  const r = await db.query<Row>(
    `SELECT * FROM dig_sessions WHERE ${where} ORDER BY last_activity_at DESC LIMIT $2`,
    params,
  );
  const rows = r.rows.slice(0, limit);
  const sessions = await Promise.all(rows.map((s) => summarise(db, cat, s)));
  return {
    sessions,
    hasMore: r.rows.length > limit,
    nextCursor:
      r.rows.length > limit ? (sessions[sessions.length - 1]?.lastActivityAt ?? null) : null,
  };
}

/** POST /digs/:id/next — (re)generate suggestions for the current node with a mode/distance. */
export async function nextSuggestions(
  db: Db,
  principalId: string,
  sessionId: string,
  input: { mode?: DigMode; distance?: DigDistance; nodeId?: string },
  opts: { debug?: boolean } = {},
): Promise<DigState> {
  const cat = await getCatalogue(db);
  const s = await requireSession(db, principalId, sessionId);
  const state = await loadState(db, sessionId);
  const node = await getNode(
    db,
    sessionId,
    input.nodeId ?? (s.current_node_id as string | null) ?? null,
  );
  if (!node) throw new ApiError("NOT_FOUND", "No current record");
  const mode = input.mode ?? (s.mode as DigMode);
  const distance = input.distance ?? (s.discovery_distance as DigDistance);
  const taste = await loadStableTaste(db, principalId);
  const { result } = regenerate(cat, state, node, mode, distance, taste, Boolean(opts.debug));
  await db.query(
    "UPDATE dig_sessions SET mode = $2, discovery_distance = $3, last_activity_at = now() WHERE id = $1",
    [sessionId, mode, distance],
  );
  await saveState(db, sessionId, state);
  await event(db, principalId, sessionId, "branch_selected", {
    nodeId: node.id,
    meta: { mode, distance, pool: result.poolSize },
  });
  const out = await getDig(db, principalId, sessionId, opts);
  if (opts.debug) out.suggestions = result.suggestions;
  out.exhausted = result.exhausted;
  if (result.exhausted)
    out.sessionNote = "No strong links left here. Jump back or try a different route.";
  return out;
}

export interface ActionInput {
  action: "pass" | "keep" | "love" | "dig_deeper" | "select" | "wrong_direction" | "back" | "jump";
  candidateId?: string;
  nodeId?: string;
  mode?: DigMode;
  distance?: DigDistance;
  reasonCode?: WrongDirectionReason;
  idempotencyKey: string;
}

export async function applyAction(
  db: Db,
  principalId: string,
  sessionId: string,
  input: ActionInput,
  opts: { debug?: boolean } = {},
): Promise<DigState> {
  const cat = await getCatalogue(db);
  const s = await requireSession(db, principalId, sessionId);
  const dup = await db.query<{ id: string }>(
    "SELECT id FROM discovery_events WHERE session_id = $1 AND idempotency_key = $2",
    [sessionId, input.idempotencyKey],
  );
  if (dup.rows[0]) return getDig(db, principalId, sessionId, opts); // idempotent replay
  const state = await loadState(db, sessionId);
  const taste = await loadStableTaste(db, principalId);
  const current = await getNode(db, sessionId, (s.current_node_id as string | null) ?? null);
  if (!current) throw new ApiError("NOT_FOUND", "No current record");
  const sessionMode = (input.mode ?? s.mode) as DigMode;
  const sessionDistance = (input.distance ?? s.discovery_distance) as DigDistance;
  const changed: string[] = [];
  let note: string | null = null;
  let lastGood: string | null | undefined;

  const advanceFrom = async (
    fork: TrailNode,
    excludeCurrent: boolean,
  ): Promise<TrailNode | null> => {
    // Take the next unconsumed candidate off the fork's queue; rebuild if empty.
    let q = state.queues[fork.id];
    const pick = () =>
      q?.candidates.find(
        (c) =>
          !q!.consumed.includes(c.candidateId) &&
          !state.visited.includes(c.recordingId) &&
          !state.excluded.includes(c.recordingId),
      );
    let next = pick();
    if (!next) {
      regenerate(
        cat,
        state,
        fork,
        q?.mode ?? sessionMode,
        q?.distance ?? sessionDistance,
        taste,
        false,
      );
      q = state.queues[fork.id];
      next = pick();
    }
    if (!next || !q) return null;
    q.consumed.push(next.candidateId);
    const node = await addNode(
      db,
      sessionId,
      fork,
      next.recordingId,
      next.explanation,
      q.mode,
      next.viaEdgeId,
    );
    state.visited.push(next.recordingId);
    if (excludeCurrent) state.excluded.push(current.recordingId);
    return node;
  };

  switch (input.action) {
    case "pass": {
      await db.query(
        "UPDATE trail_nodes SET outcome = 'passed' WHERE id = $1 AND outcome = 'viewed'",
        [current.id],
      );
      bumpAffinity(cat, state, current.recordingId, SIGNALS.pass);
      state.consecutivePasses += 1;
      const fork = (await getNode(db, sessionId, current.parentId)) ?? current;
      const node = await advanceFrom(fork, false);
      await event(db, principalId, sessionId, "candidate_passed", {
        nodeId: current.id,
        idempotencyKey: input.idempotencyKey,
      });
      if (node) await setCurrent(db, sessionId, node.id);
      else note = "No strong links left here. Jump back or try a different route.";
      break;
    }
    case "keep":
    case "love": {
      const love = input.action === "love";
      await db.query("UPDATE trail_nodes SET outcome = $2 WHERE id = $1", [
        current.id,
        love ? "loved" : "kept",
      ]);
      bumpAffinity(cat, state, current.recordingId, love ? SIGNALS.love : SIGNALS.keep);
      state.consecutivePasses = 0;
      lastGood = current.id;
      const evId = await event(db, principalId, sessionId, love ? "item_loved" : "item_kept", {
        nodeId: current.id,
        idempotencyKey: input.idempotencyKey,
      });
      await keepRecording(db, principalId, current.recordingId, { loved: love, sessionId });
      const stable = await recordStableSignal(
        db,
        cat,
        principalId,
        current.recordingId,
        love ? "love" : "keep",
        evId,
      );
      note = stable
        ? love
          ? "Loved. Saved to your crate and added to your stable taste (opt-in)."
          : "Kept. Saved to All Finds."
        : love
          ? "Loved and saved. Your stable taste is unchanged (personalisation is off)."
          : "Kept. Saved to All Finds.";
      break;
    }
    case "dig_deeper": {
      await db.query(
        "UPDATE trail_nodes SET outcome = 'forked' WHERE id = $1 AND outcome = 'viewed'",
        [current.id],
      );
      state.consecutivePasses = 0;
      regenerate(cat, state, current, sessionMode, sessionDistance, taste, false);
      await db.query("UPDATE dig_sessions SET mode = $2, discovery_distance = $3 WHERE id = $1", [
        sessionId,
        sessionMode,
        sessionDistance,
      ]);
      const node = await advanceFrom(current, false);
      await event(db, principalId, sessionId, "branch_selected", {
        nodeId: current.id,
        idempotencyKey: input.idempotencyKey,
        meta: { mode: sessionMode, distance: sessionDistance },
      });
      if (node) await setCurrent(db, sessionId, node.id);
      else note = "No strong links from here in that direction. Try another kind of connection.";
      break;
    }
    case "select": {
      // Choose a specific suggestion from the current node's queue.
      const q = state.queues[current.id];
      const cand = q?.candidates.find((c) => c.candidateId === input.candidateId);
      if (!q || !cand) throw new ApiError("NOT_FOUND", "That suggestion is no longer on the table");
      await db.query(
        "UPDATE trail_nodes SET outcome = 'forked' WHERE id = $1 AND outcome = 'viewed'",
        [current.id],
      );
      q.consumed.push(cand.candidateId);
      const node = await addNode(
        db,
        sessionId,
        current,
        cand.recordingId,
        cand.explanation,
        q.mode,
        cand.viaEdgeId,
      );
      state.visited.push(cand.recordingId);
      state.consecutivePasses = 0;
      await event(db, principalId, sessionId, "branch_selected", {
        nodeId: node.id,
        candidateId: cand.candidateId,
        idempotencyKey: input.idempotencyKey,
        meta: { relation_type: cand.explanation.steps[0]?.relation },
      });
      await setCurrent(db, sessionId, node.id);
      break;
    }
    case "wrong_direction": {
      await db.query("UPDATE trail_nodes SET outcome = 'wrong_direction' WHERE id = $1", [
        current.id,
      ]);
      state.wrongDirections += 1;
      state.consecutivePasses = 0;
      for (const step of current.explanation?.steps ?? []) {
        state.rejectedEdgeTypes[step.relation] = Math.min(
          1,
          (state.rejectedEdgeTypes[step.relation] ?? 0) + 0.5,
        );
        changed.push(`Fewer “${step.relation.replace(/_/g, " ")}” links in this dig`);
      }
      // Penalise this record's traits within the session only. Which traits
      // depends on the (optional) reason: wrong era => era tags; otherwise
      // mood/style tags. "Too far from seed" and "not interested in branch"
      // are about the path, not the record, so only the edge penalties apply.
      const penaliseEra = input.reasonCode === "wrong_era";
      const penaliseTraits =
        !input.reasonCode ||
        ["too_polished", "too_aggressive", "too_similar", "wrong_era", "other"].includes(
          input.reasonCode,
        );
      if (penaliseTraits) {
        for (const t of cat.recordingTags.get(current.recordingId) ?? []) {
          const tag = cat.tags.get(t);
          if (!tag) continue;
          const hit = penaliseEra
            ? tag.kind === "era"
            : tag.kind === "mood" || tag.kind === "style";
          if (!hit) continue;
          state.rejectedTags[t] = Math.min(1, (state.rejectedTags[t] ?? 0) + 0.4);
          changed.push(`Less “${tag.name}”`);
        }
      }
      if (input.reasonCode === "too_far_from_seed") changed.push("Staying closer to your seed");
      bumpAffinity(cat, state, current.recordingId, SIGNALS.wrong_direction * 0.3);
      state.excluded.push(current.recordingId);
      const fork = (await getNode(db, sessionId, current.parentId)) ?? current;
      const q = state.queues[fork.id];
      // Regenerate from the fork with the new penalties; Focused if the complaint was distance.
      regenerate(
        cat,
        state,
        fork,
        q?.mode ?? sessionMode,
        input.reasonCode === "too_far_from_seed" ? "focused" : (q?.distance ?? sessionDistance),
        taste,
        false,
      );
      const node = await advanceFrom(fork, false);
      await event(db, principalId, sessionId, "wrong_direction", {
        nodeId: current.id,
        reason: input.reasonCode ?? null,
        idempotencyKey: input.idempotencyKey,
        meta: { changed },
      });
      if (node) await setCurrent(db, sessionId, node.id);
      else note = "No strong links left here. Jump back or try a different route.";
      if (!note) note = "Changed this dig only. Your overall taste hasn't changed.";
      break;
    }
    case "back": {
      const parent = await getNode(db, sessionId, current.parentId);
      if (!parent) throw new ApiError("CONFLICT", "You're at the start of this dig");
      await setCurrent(db, sessionId, parent.id);
      await event(db, principalId, sessionId, "trail_backtracked", {
        nodeId: parent.id,
        idempotencyKey: input.idempotencyKey,
      });
      bumpAffinity(cat, state, parent.recordingId, SIGNALS.revisit * 0.2);
      break;
    }
    case "jump": {
      const target = await getNode(db, sessionId, input.nodeId ?? null);
      if (!target) throw new ApiError("NOT_FOUND", "That stop isn't on this trail");
      await setCurrent(db, sessionId, target.id);
      await event(db, principalId, sessionId, "item_revisited", {
        nodeId: target.id,
        idempotencyKey: input.idempotencyKey,
      });
      bumpAffinity(cat, state, target.recordingId, SIGNALS.revisit * 0.2);
      break;
    }
  }
  await saveState(db, sessionId, state, lastGood);
  await db.query("UPDATE dig_sessions SET last_activity_at = now() WHERE id = $1", [sessionId]);
  const out = await getDig(db, principalId, sessionId, opts);
  out.sessionNote = note;
  if (changed.length) out.changed = [...new Set(changed)];
  return out;
}

export async function forkDig(
  db: Db,
  principalId: string,
  sessionId: string,
  input: { fromNodeId: string; mode: DigMode; distance: DigDistance },
): Promise<DigState> {
  const cat = await getCatalogue(db);
  const s = await requireSession(db, principalId, sessionId);
  const node = await getNode(db, sessionId, input.fromNodeId);
  if (!node) throw new ApiError("NOT_FOUND", "That stop isn't on this trail");
  const card = buildCard(cat, node.recordingId);
  const child = await createDig(db, principalId, {
    seed: { type: "recording", id: node.recordingId },
    mode: input.mode,
    distance: input.distance,
    title: `Fork: ${card?.artist?.name ?? ""} – ${card?.recording.title ?? ""}`.trim(),
  });
  await db.query(
    "UPDATE dig_sessions SET seed_type = 'fork', forked_from_session_id = $2, forked_from_node_id = $3 WHERE id = $1",
    [child.session.id, String(s.id), node.id],
  );
  await event(db, principalId, child.session.id, "session_forked", {
    nodeId: node.id,
    meta: { from_session: String(s.id) },
  });
  return getDig(db, principalId, child.session.id);
}

export async function resumeDig(db: Db, principalId: string, sessionId: string): Promise<DigState> {
  await requireSession(db, principalId, sessionId);
  await db.query(
    "UPDATE dig_sessions SET last_activity_at = now(), status = 'active' WHERE id = $1",
    [sessionId],
  );
  await event(db, principalId, sessionId, "session_resumed", {});
  return getDig(db, principalId, sessionId);
}

export async function patchDig(
  db: Db,
  principalId: string,
  sessionId: string,
  patch: { title?: string; status?: "active" | "archived" | "deleted" },
): Promise<SessionSummary> {
  const cat = await getCatalogue(db);
  await requireSession(db, principalId, sessionId);
  if (patch.title !== undefined)
    await db.query("UPDATE dig_sessions SET title = $2 WHERE id = $1", [sessionId, patch.title]);
  if (patch.status !== undefined)
    await db.query("UPDATE dig_sessions SET status = $2 WHERE id = $1", [sessionId, patch.status]);
  const r = await db.query<Row>("SELECT * FROM dig_sessions WHERE id = $1", [sessionId]);
  return summarise(db, cat, r.rows[0]!);
}

export async function clearSessionHistory(db: Db, principalId: string): Promise<number> {
  const r = await db.query(
    "UPDATE dig_sessions SET status = 'deleted' WHERE principal_id = $1 AND status <> 'deleted'",
    [principalId],
  );
  return r.rowCount;
}

export const _internal = { randomUUID };
