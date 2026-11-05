const fs = require('node:fs');
const path = require('node:path');
const { CAMPUS, RADIUS, CATEGORIES } = require('./config');
const { validCoordinates, distanceMeters } = require('./geo');
const SEEDS_PATH = path.join(__dirname, '..', 'data', 'places.json');
const CATEGORY_IDS = new Set(CATEGORIES.map(x => x.id));
const GOOGLE_TYPES = {
  food: ['restaurant','fast_food_restaurant','cafe'],
  groceries: ['supermarket','grocery_store','convenience_store'],
  health: ['pharmacy','drugstore','medical_clinic'],
  printing: ['book_store','business_center'],
  study: ['library','coworking_space'],
  banking: ['bank','atm'],
  grooming: ['barber_shop','hair_salon','beauty_salon'],
  transport: ['bus_station','bus_stop','taxi_stand'],
  fun: ['performing_arts_theater','movie_theater','amusement_center']
};
const OSM_AMENITIES = { restaurant:'food',fast_food:'food',cafe:'food',food_court:'food',pharmacy:'health',clinic:'health',doctors:'health',library:'study',bank:'banking',atm:'banking',theatre:'fun',cinema:'fun',arts_centre:'fun',bus_station:'transport',taxi:'transport' };
const OSM_SHOPS = { supermarket:'groceries',grocery:'groceries',convenience:'groceries',chemist:'health',copyshop:'printing',stationery:'printing',books:'printing',hairdresser:'grooming',beauty:'grooming',barber:'grooming' };
const ORIGIN = '291 Helen Joseph Street, Pretoria Central, Pretoria, South Africa';
const cache = { expire:0, places:[], warning:null, provider:'curated' };
const mapsDirections = destination => 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(ORIGIN) + '&destination=' + encodeURIComponent(destination) + '&travelmode=walking';
const placeSearch = (name, address) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name+' '+address);
function distanceSort(a,b) { return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) || a.name.localeCompare(b.name); }
function normalize(raw) {
  if(!raw || typeof raw.name !== 'string' || !raw.name.trim() || !CATEGORY_IDS.has(raw.category)) return null;
  const lat = raw.lat === undefined || raw.lat === null || raw.lat === '' ? null : Number(raw.lat);
  const lng = raw.lng === undefined || raw.lng === null || raw.lng === '' ? null : Number(raw.lng);
  const mapped = lat !== null && lng !== null && validCoordinates(lat,lng);
  const distance = mapped ? distanceMeters(CAMPUS, {lat,lng}) : null;
  if(mapped && distance > RADIUS + 1e-7) return null;
  const address = String(raw.address || 'Precise address not supplied').trim().slice(0,240);
  return {
    id:String(raw.id || `curated:${raw.name}`).slice(0,160),
    name:raw.name.trim().slice(0,130),
    aliases:Array.isArray(raw.aliases)?raw.aliases.filter(x=>typeof x==='string').slice(0,8):[],
    category:raw.category,address,lat:mapped?lat:null,lng:mapped?lng:null,
    distanceMeters:mapped?Math.round(distance):null,
    distanceKm:mapped?Number((distance/1000).toFixed(2)):null,
    isWithinRadius:mapped,
    status:mapped?'within-radius':'needs-location-verification',
    description:String(raw.description || '').slice(0,500),
    image:typeof raw.image==='string' && /^\/images\/[a-z0-9-]+\.jpg$/.test(raw.image) ? raw.image : null,
    source:String(raw.sourceLabel || raw.source || 'Community submitted').slice(0,120),
    sourceUrl:typeof raw.sourceUrl==='string' && /^https:\/\//.test(raw.sourceUrl)?raw.sourceUrl:null,
    verificationNote:String(raw.verificationNote || '').slice(0,320),
    submittedAddress:String(raw.submittedAddress || '').slice(0,200),
    hasPlacesPhoto:Boolean(raw.hasPlacesPhoto),
    locationPrecision:mapped?String(raw.locationPrecision || 'listed map point'):'not geocoded',
    directionsUrl:mapsDirections(mapped?`${lat},${lng}`:address.includes('exact street')?raw.name+', Pretoria Central':`${address}, South Africa`),
    mapSearchUrl:placeSearch(raw.name,address)
  };
}
function loadSeeds() {
  const json=JSON.parse(fs.readFileSync(SEEDS_PATH,'utf8'));
  if(!Array.isArray(json)) throw Error('data/places.json must be a JSON array');
  return json.map(normalize).filter(Boolean);
}
function osmCategory(tags) {
  return OSM_SHOPS[tags.shop] || OSM_AMENITIES[tags.amenity] || (tags.public_transport || tags.highway==='bus_stop' || tags.railway==='tram_stop' ? 'transport' : null);
}
function overpassQuery() {
  const center=`${CAMPUS.lat},${CAMPUS.lng}`;
  return `[out:json][timeout:15];(nwr(around:${RADIUS},${center})["amenity"~"^(restaurant|fast_food|cafe|food_court|pharmacy|clinic|doctors|library|bank|atm|theatre|cinema|arts_centre|bus_station|taxi)$"];nwr(around:${RADIUS},${center})["shop"~"^(supermarket|grocery|convenience|chemist|copyshop|stationery|books|hairdresser|beauty|barber)$"];nwr(around:${RADIUS},${center})["public_transport"];nwr(around:${RADIUS},${center})["highway"="bus_stop"];);out center 500;`;
}
function addressOSM(tags) {
  const street=[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' ');
  return [street,tags['addr:suburb'],tags['addr:city']].filter(Boolean).join(', ') || 'Street address not listed on OpenStreetMap';
}
async function osmSearch() {
  const r=await fetch('https://overpass.kumi.systems/api/interpreter', {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:overpassQuery()}),signal:AbortSignal.timeout(8500)});
  if(!r.ok) throw Error(`OSM HTTP ${r.status}`);
  const data=await r.json();
  return (data.elements || []).map(e=>{
    const tags=e.tags || {};
    return normalize({id:`osm:${e.type}:${e.id}`,name:tags.name,category:osmCategory(tags),lat:e.lat ?? e.center?.lat,lng:e.lon ?? e.center?.lon,address:addressOSM(tags),sourceLabel:'OpenStreetMap contributors',sourceUrl:`https://www.openstreetmap.org/${e.type}/${e.id}`,locationPrecision:e.center?'OSM building centre':'OSM mapped point'});
  }).filter(x=>x && x.isWithinRadius);
}
async function googleSearch() {
  const key=process.env.GOOGLE_PLACES_API_KEY;
  if(!key) throw Error('GOOGLE_PLACES_API_KEY is not set');
  const output=[]; const errors=[];
  for(const [category,types] of Object.entries(GOOGLE_TYPES)) {
    try {
      const r=await fetch('https://places.googleapis.com/v1/places:searchNearby',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.photos'},body:JSON.stringify({includedTypes:types,rankPreference:'DISTANCE',maxResultCount:20,locationRestriction:{circle:{center:{latitude:CAMPUS.lat,longitude:CAMPUS.lng},radius:RADIUS}}}),signal:AbortSignal.timeout(8000)});
      if(!r.ok) throw Error(`HTTP ${r.status}`);
      const data=await r.json();
      for(const g of data.places || []) {
        const p=normalize({id:'google:'+g.id,name:g.displayName?.text,category,lat:g.location?.latitude,lng:g.location?.longitude,address:g.formattedAddress,hasPlacesPhoto:Boolean(g.photos?.length),sourceLabel:'Google Places',sourceUrl:'https://www.google.com/maps/search/?api=1&query_place_id='+encodeURIComponent(g.id),locationPrecision:'Google Places mapped point'});
        if(p && p.isWithinRadius) output.push(p);
      }
    } catch(e) {errors.push(category);}
  }
  if(!output.length && errors.length===Object.keys(GOOGLE_TYPES).length) throw Error('Google Places search unavailable');
  return {places:output, warning:errors.length?`Google Places data incomplete for ${errors.join(', ')}.`:null};
}
function nameKey(name) {return String(name).toLowerCase().replace(/[^a-z0-9]/g,'');}
function mergePlaces(seeds, live) {
  const originals=seeds.map(x=>({...x}));
  const unmatched=[];
  for(const remote of live) {
    const match=originals.find(local=>local.category===remote.category && ([local.name,...local.aliases].some(s=>nameKey(s)===nameKey(remote.name)) || (nameKey(remote.name).includes(nameKey(local.name)) && nameKey(local.name).length>9)) && (!local.isWithinRadius || distanceMeters(local,remote) < 120));
    if(match) {
      if(!match.isWithinRadius) {
        Object.assign(match,{lat:remote.lat,lng:remote.lng,distanceMeters:remote.distanceMeters,distanceKm:remote.distanceKm,isWithinRadius:true,status:'within-radius',locationPrecision:remote.locationPrecision,verificationNote:match.verificationNote || 'Coordinates obtained from live map service; confirm storefront entrance.',directionsUrl:remote.directionsUrl});
      }
      match.hasPlacesPhoto=match.hasPlacesPhoto || remote.hasPlacesPhoto;
    } else if(!unmatched.some(p=>p.category===remote.category && nameKey(p.name)===nameKey(remote.name) && distanceMeters(p,remote)<75)) unmatched.push(remote);
  }
  return [...originals,...unmatched];
}
async function getDirectory(options={}) {
  const provider=String(process.env.DIRECTORY_PROVIDER || 'seed').toLowerCase();
  let live=[],warning=null,active='curated';
  if(!options.seedOnly && !['seed','none'].includes(provider)) {
    if(Date.now()<cache.expire) {live=cache.places;warning=cache.warning;active=cache.provider;}
    else {
      try {
        const chosen=provider==='auto'?(process.env.GOOGLE_PLACES_API_KEY?'google':'osm'):provider;
        if(chosen==='google'){const r=await googleSearch();live=r.places;warning=r.warning;active='google';}
        else if(chosen==='osm'){live=await osmSearch();active='osm';}
        else warning='Unknown DIRECTORY_PROVIDER; using local directory.';
      } catch(e) {warning=`Live map discovery unavailable; showing student-submitted and curated entries (${e.message}).`;}
      Object.assign(cache,{expire:Date.now()+(warning?60_000:10*60_000),places:live,warning,provider:active});
    }
  }
  let list=mergePlaces(loadSeeds(),live);
  const category=String(options.category || 'all');
  if(CATEGORY_IDS.has(category)) list=list.filter(x=>x.category===category);
  const q=String(options.q || '').trim().toLowerCase().slice(0,120);
  if(q) list=list.filter(p=>[p.name,...p.aliases,p.address,p.description,p.category].some(v=>String(v).toLowerCase().includes(q)));
  const places=list.filter(p=>p.isWithinRadius).sort(distanceSort).slice(0,350);
  const pending=list.filter(p=>!p.isWithinRadius).sort((a,b)=>a.name.localeCompare(b.name));
  return {places,pending,campus:CAMPUS,radiusMeters:RADIUS,categories:CATEGORIES,provider:active,warning,disclaimer:'Only mapped places at or within 1,000 m straight-line from an approximate campus reference pin qualify as nearby. Other student-submitted places are visible for verification, but are not claimed to be within the radius. Direction buttons always start at 291 Helen Joseph Street. Actual walking routes, prices and opening hours are not verified.'};
}
module.exports={getDirectory,loadSeeds,normalize,mergePlaces,mapsDirections,overpassQuery,osmCategory};
