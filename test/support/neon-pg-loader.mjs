const shim = new URL("./neon-pg.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === "@neondatabase/serverless") return { url: shim, shortCircuit: true };
  return next(specifier, context);
}
