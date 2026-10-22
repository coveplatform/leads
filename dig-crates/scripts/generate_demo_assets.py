"""Deterministically generate mock record-shop seed data, original SVG covers, logos, and WAV demo sounds.
All releases, identities and audio are fictional. Run from any working directory.
"""
from pathlib import Path
import json, random, math, wave, struct, hashlib, html
from datetime import datetime, timedelta, timezone

BASE = Path(__file__).resolve().parent.parent
EXAMPLES = BASE / 'examples'
ASSETS = BASE / 'assets'
COVERS = ASSETS / 'covers'
LOGOS = ASSETS / 'logos'
AUDIO = ASSETS / 'demo-audio'
for p in (EXAMPLES, COVERS, LOGOS, AUDIO): p.mkdir(parents=True, exist_ok=True)
rng = random.Random(271828)

store_meta = [
    dict(id='store-basement-wax',slug='basement-wax',name='Basement Wax',headline='Records worth getting lost in.',description='A fictional specialist shop for underground club sounds.',currency='AUD',country='Australia',
         genres=['House','Techno','Electro','Ambient','Breakbeat'],styles=['Deep House','Dub Techno','Detroit Techno','Acid','Minimal','Broken Beat','Garage','Atmospheric','Raw','Leftfield'],
         labels=['Subfloor Audio','Inner Orbit','Nite Sequence','Black Raster','Third Channel','Cobalt Press','Level One','Deep Transit','Halo Tapes','Late Signal'],
         artists=['Glass Circuit','Quiet Harbour','Signal Drift','Rare Frequency','Night Index','Clara Sector','Basic Pattern','Unit Memory','Hollow Tone','Velvet Circuit','Tidal Phase','Pacific Signal','Southside Research','Delta Form','Analog Tourist','Night Transit','Garden Machine','Stillpoint','Chrome Hour','Warehouse Method','Soft Current','Mira Pattern','Lunar Surface','Channel Five','Static Haze'],
         palette=['#202122','#C4A78F','#A37051','#777D75','#53606D'],
         theme=dict(background='#1D1E20',surface='#282A2D',surfaceRaised='#333539',foreground='#F0EDE8',foregroundMuted='#B4B0AA',accent='#D29A68',accentForeground='#201B17',border='#4B4B4A',focusRing='#FFCB90',fontDisplay='Arial, sans-serif',fontBody='Arial, sans-serif',buttonRadius=8,cardRadius=10,coverRadius=3,shadowStyle='soft',headerStyle='minimal')),
    dict(id='store-sunday-records',slug='sunday-records',name='Sunday Records',headline='Music for the long way home.',description='A fictional soulful and eclectic independent record shop.',currency='AUD',country='Australia',
         genres=['Jazz','Soul','Ambient','World','House'],styles=['Spiritual Jazz','Deep Soul','Balearic','Downtempo','Fusion','Organic','Brazilian','Warm','Instrumental','Disco'],
         labels=['Quiet Palms','Sunroom Editions','Morning Bird','Riverstone Music','Soft Horizon','Garden State','Linen Press','Portside Editions','Kindred Wax','Open Window'],
         artists=['Mira Vale','The Sunday Quartet','Palm Orchard','Lena Sora','Blue Lanterns','River Geometry','Golden Hours','The Daylight Ensemble','Caravan Room','Still Garden','Mai Lopez','Onda Verde','Parallel Sun','North Coast Trio','Eden Avenue','Morning Friends','Soft Weather','Aster Field','Cloud Kitchen','Low Tide Quartet','Nara Stone','Orange Meridian','Camino Azul','Kindred Motion','The Inner Light'],
         palette=['#EDE5D6','#557762','#BFA583','#9B7460','#737E78'],
         theme=dict(background='#F4EEE3',surface='#EEE5D5',surfaceRaised='#E2D8C6',foreground='#22372A',foregroundMuted='#59685C',accent='#35634D',accentForeground='#FFFFFF',border='#C9C0AF',focusRing='#285A43',fontDisplay='Georgia, serif',fontBody='Arial, sans-serif',buttonRadius=4,cardRadius=6,coverRadius=1,shadowStyle='none',headerStyle='editorial')),
    dict(id='store-signal-records',slug='signal-records',name='Signal Records',headline='Find a different frequency.',description='A fictional colourful shop for independent and alternative releases.',currency='AUD',country='Australia',
         genres=['Disco','Synth','New Wave','House','Electronic'],styles=['Italo Disco','Synth Pop','Nu Disco','Post-Punk','Leftfield','Hi-NRG','Machine Funk','Dream Pop','Electro','New Romantic'],
         labels=['Glassframe','Future Repeat','Neon Thread','Circuit City','Linework','Motion Studies','Electric Paper','Bright Channel','Ghost Town','Studio 86'],
         artists=['Silver Output','Neon Pattern','Weekend Forecast','Juno Valley','Screen Memory','City Mirror','Electric Violet','Century Club','Modern Archive','Alfa Weekend','Blue Toner','Signal Gardens','Futura Kids','Headphone Motel','Pixel Affair','Violet Transit','Stereo Hands','Frame Theory','Sunset Unit','Third Room','Cascade Dept','Backlight Club','Human Pattern','Plastic Summer','Halogen Bay'],
         palette=['#E7EAF2','#455FA9','#A2B6DF','#F7A97E','#596E96'],
         theme=dict(background='#ECF0F7',surface='#FFFFFF',surfaceRaised='#DCE5F4',foreground='#172549',foregroundMuted='#576687',accent='#345FC4',accentForeground='#FFFFFF',border='#C5D0E4',focusRing='#1F4BAA',fontDisplay='Arial Black, Arial, sans-serif',fontBody='Arial, sans-serif',buttonRadius=15,cardRadius=18,coverRadius=4,shadowStyle='strong',headerStyle='bold'))
]

prefixes=['Northern','Second','Blue','Soft','Parallel','Late','Ghost','Sunday','Solar','Hidden','Endless','Quiet','Another','Midnight','Golden','Invisible','After','Deep','Tomorrow','Slow','Inner','First','Outer','Modern','Silver','Secret','Violet','Glass','Analog','Distant','Open','Small','Ocean','Starlight','Warehouse','Future','Coastal','Moving','Long','Broken']
suffixes=['Connection','Light','Transmissions','Circuit','Memory','Days','Sequences','Motion','Horizons','Hours','Sessions','Telegrams','Language','Frequencies','Shapes','Reflections','Transit','Patterns','Dreams','Machines','Worlds','Echoes','Forms','Signals','Window','Theory','Garden','Sound','Rhythm','Research','Archive','Sketches','Variation','Mirrors','Nocturne','Reasons','Collection','Studies','Places','Versions']
forms=['EP','LP','Vol. 1','Vol. 2','Remixes','Sessions','12-inch','Part One','Part Two','Edits','Dubs','Expressions']


def slughash(s):
    return hashlib.sha256(s.encode()).hexdigest()


def cover_svg(rid, artist, title, palette, idx):
    local = random.Random(int(slughash(rid)[:12],16))
    bg=palette[local.randrange(len(palette))]
    fg='#F6F1E6' if idx%3 else '#1E2225'
    # simple geometric editorial art, wholly generated from shapes and text
    modes=['circle','stripes','rings','diagonal','blocks','sun','grid']
    mode=modes[idx%len(modes)]
    pieces=''
    p2=palette[(idx+1)%len(palette)]
    p3=palette[(idx+3)%len(palette)]
    if mode=='circle':
        pieces=f'<circle cx="165" cy="145" r="108" fill="{p2}"/><circle cx="165" cy="145" r="45" fill="{p3}"/><circle cx="165" cy="145" r="8" fill="{bg}"/>'
    elif mode=='stripes':
        pieces=''.join(f'<rect x="{i*44-60}" y="0" width="27" height="340" transform="rotate(13 165 165)" fill="{p2 if i%2 else p3}" opacity=".78"/>' for i in range(11))
    elif mode=='rings':
        pieces=''.join(f'<circle cx="168" cy="157" r="{x}" fill="none" stroke="{p2 if i%2 else p3}" stroke-width="{8 if i%2 else 5}"/>' for i,x in enumerate(range(30,138,18)))
    elif mode=='diagonal':
        pieces=f'<polygon points="0,0 330,0 0,330" fill="{p2}" opacity=".75"/><polygon points="330,0 330,330 0,330" fill="{p3}" opacity=".62"/>'
    elif mode=='blocks':
        pieces=''.join(f'<rect x="{local.randrange(6)*48}" y="{local.randrange(6)*45}" width="{local.randrange(2,4)*40}" height="{local.randrange(2,4)*34}" fill="{p2 if i%2 else p3}" opacity=".55"/>' for i in range(8))
    elif mode=='sun':
        pieces=f'<circle cx="166" cy="145" r="95" fill="{p3}"/>' + ''.join(f'<rect x="0" y="{y}" width="330" height="9" fill="{bg}" opacity=".75"/>' for y in range(92,250,22))
    elif mode=='grid':
        pieces=''.join(f'<path d="M {k} 0 V 330 M 0 {k} H 330" stroke="{p2}" stroke-width="3" opacity=".58"/>' for k in range(0,331,30))
    texta=html.escape(artist[:29]); textt=html.escape(title[:36])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="330" height="330" viewBox="0 0 330 330" role="img" aria-label="Fictional record cover: {texta} - {textt}">
<rect width="330" height="330" fill="{bg}"/>{pieces}
<rect x="12" y="263" width="306" height="57" rx="1" fill="{bg}" opacity=".93"/>
<text x="22" y="284" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="{fg}">{texta}</text>
<text x="22" y="304" font-family="Arial, sans-serif" font-size="11" fill="{fg}">{textt}</text>
</svg>'''


def logo_svg(name, palette):
    fg=palette[1]; b=palette[0]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="260" height="64" viewBox="0 0 260 64"><rect width="260" height="64" fill="none"/><circle cx="31" cy="32" r="24" fill="{fg}"/><circle cx="31" cy="32" r="8" fill="{b}"/><text x="66" y="39" font-size="22" font-family="Arial, sans-serif" font-weight="bold" fill="{fg}">{html.escape(name.upper())}</text></svg>'''


def make_synthetic_wav(path, bpm, notes):
    sr=22050; seconds=8.0
    n=int(sr*seconds)
    samples=[]
    step=60/bpm
    for i in range(n):
        t=i/sr
        beat=(t/step)%1
        kick=0.0
        if beat<0.27:
            freq=105-65*(beat/0.27)
            kick=0.25*math.sin(2*math.pi*freq*t)*math.exp(-beat*18)
        note=notes[int(t/(step*2))%len(notes)]
        bass=0.12*math.sin(2*math.pi*note*t)
        pad=0.06*math.sin(2*math.pi*(note*2)*t)+0.03*math.sin(2*math.pi*(note*3.02)*t)
        gate=(0.73+0.27*math.cos(2*math.pi*t/(step*4)))
        val=(kick+bass+pad)*gate
        val=max(-1,min(1,val))
        samples.append(int(val*32767))
    with wave.open(str(path),'w') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes(struct.pack('<'+'h'*len(samples),*samples))

for i,(bpm,notes) in enumerate([(118,[55,65.4,73.42,65.4]),(128,[65.4,77.8,55,87.3]),(105,[49,65.4,73.4,55])],start=1):
    make_synthetic_wav(AUDIO/f'demo-loop-{i:02d}.wav',bpm,notes)

stores=[]; records=[]; crates=[]
for si,meta in enumerate(store_meta):
    store={k:meta[k] for k in ['id','slug','name','headline','description','currency','country','theme']}
    store['logoUrl']=f'/demo-logos/{meta["slug"]}.svg'
    store['allowedEmbedOrigins']=['http://localhost:3000','http://127.0.0.1:3000']
    store['crateIds']=[]
    (LOGOS/f'{meta["slug"]}.svg').write_text(logo_svg(meta['name'],meta['palette']))
    genres=meta['genres']; styles=meta['styles']; labels=meta['labels']; artists=meta['artists']
    for i in range(180):
        rid=f'{meta["slug"][:2]}-{i+1:03d}'
        artist=artists[(i*11 + i//7)%len(artists)]
        title=f'{prefixes[(i*7+si*4)%len(prefixes)]} {suffixes[(i*13+si)%len(suffixes)]}'
        if i%7==0:title+=f' {forms[(i+si)%len(forms)]}'
        primary=genres[(i*7+i//5)%len(genres)]
        tag=styles[(i*11+i//8+si)%len(styles)]
        year=(1990+i%37) if si!=1 else (1973+i%51)
        label=labels[(i*3+i//13)%len(labels)]
        is_new=i>=140; staff=(i%9==0); sold=(i%17==0)
        availability='sold' if sold else 'available'
        preview=None if i%5==0 else dict(type='local-demo',url=f'/demo-audio/demo-loop-{(i%3)+1:02d}.wav',durationSec=8)
        cmedia=['NM','VG+','VG','VG+','G+','NM'][i%6]
        csleeve=['VG+','NM','VG','VG+','G','VG+'][i%6]
        rec=dict(id=rid,storeId=meta['id'],artist=artist,title=title,label=label,
                 catalogueNumber=f'{label.upper().replace(" ","")[:4]}-{1000+i}',releaseYear=year,
                 format=['12-inch','LP','EP','7-inch'][i%4],genres=[primary],styles=[tag],tags=[tag.lower(),primary.lower(), 'staff favorite' if staff else 'diggable'],
                 bpm=(98+(i*7)%48) if primary not in ['Jazz','Soul','Ambient','World'] else None,
                 conditionMedia=cmedia,conditionSleeve=csleeve,priceMinor=(18+(i*13)%73)*100,currency='AUD',stockStatus=availability,
                 newArrival=is_new,staffPick=staff,artworkUrl=None if i%47==0 else f'/covers/{rid}.svg',
                 tracklist=[{'position':'A1','title':f'{prefixes[i%len(prefixes)]} Mix','durationSec':321},{'position':'B1','title':f'{suffixes[i%len(suffixes)]} Version','durationSec':276}],
                 description=f'Fictional demo release from {label}. No real product is for sale.',preview=preview,productUrl=None,
                 createdAt=(datetime(2026,10,1,tzinfo=timezone.utc)-timedelta(days=180-i)).isoformat().replace('+00:00','Z'))
        records.append(rec)
        (COVERS/f'{rid}.svg').write_text(cover_svg(rid,artist,title,meta['palette'],i))
    definitions=[
        ('all','All Records','Everything on the shelves',{}),
        ('new','New Arrivals','Recently added to the racks',{'newArrival':True}),
        ('staff','Staff Picks','Selected for you by the shop',{'staffPick':True}),
        ('cheap','Under A$30','Affordable discoveries',{'maxPriceMinor':3000}),
    ]+[(g.lower().replace(' ','-'),g,'Explore our '+g+' crate',{'genres':[g]}) for g in genres]
    for ci,(suffix,name,desc,definition) in enumerate(definitions):
        cid=f'{meta["slug"]}-{suffix}'
        store['crateIds'].append(cid)
        crates.append(dict(id=cid,storeId=meta['id'],name=name,description=desc,coverRecordIds=[f'{meta["slug"][:2]}-{1+i*7:03d}' for i in range(4)],definition=definition,displayOrder=ci))
    stores.append(store)
seed=dict(schemaVersion=1,disclaimer='100% fictional record stores and releases; not real inventory or licensable commercial audio.',stores=stores,crates=crates,records=records)
(EXAMPLES/'demo-seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2))
print(f'Wrote {len(stores)} stores, {len(crates)} crates, {len(records)} records, {len(list(COVERS.glob("*.svg")))} SVG covers and 3 local WAV files')
