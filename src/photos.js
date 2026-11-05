const {distanceMeters, bearingDegrees} = require('./geo');
const ALLOWED_ORIGIN = /^https:\/\/places\.googleapis\.com\//;
function photoSettings() {
  return {places:Boolean(process.env.GOOGLE_PLACES_API_KEY),streetview:Boolean(process.env.GOOGLE_STREET_VIEW_API_KEY),mode:(process.env.PHOTO_MODE || 'auto').toLowerCase()};
}
async function googlePhoto(place) {
  const key=process.env.GOOGLE_PLACES_API_KEY;
  const id=place.id.startsWith('google:') ? place.id.slice(7) : null;
  if (!key || !id || !/^[a-zA-Z0-9_-]{6,}$/.test(id)) return null;
  const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'photos'},signal:AbortSignal.timeout(7000)});
  if(!response.ok) return null;
  const json=await response.json();
  const name=json.photos?.[0]?.name;
  if(!name || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return null;
  const photo=await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=720&skipHttpRedirect=true`,{headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(8000)});
  if(!photo.ok) return null;
  const info=await photo.json();
  if(!info.photoUri || !ALLOWED_ORIGIN.test(info.photoUri) && !/^https:\/\/.*(?:googleusercontent|ggpht|google)\.com\//.test(info.photoUri)) return null;
  return {redirect: info.photoUri,source:'Google Places photo'};
}
async function streetViewPhoto(place) {
  const key=process.env.GOOGLE_STREET_VIEW_API_KEY;
  if(!key) return null;
  const target=`${place.lat},${place.lng}`;
  const url=new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
  url.searchParams.set('location',target); url.searchParams.set('source','outdoor'); url.searchParams.set('key',key);
  const response=await fetch(url,{signal:AbortSignal.timeout(7000)});
  if(!response.ok) return null;
  const meta=await response.json();
  if(meta.status!=='OK' || !meta.location) return null;
  const camera={lat:meta.location.lat,lng:meta.location.lng};
  if(distanceMeters(camera,place)>70) return null;
  const photoUrl=new URL('https://maps.googleapis.com/maps/api/streetview');
  photoUrl.searchParams.set('size','720x440'); photoUrl.searchParams.set('pano',meta.pano_id);
  photoUrl.searchParams.set('heading',String(Math.round(bearingDegrees(camera,place))));
  photoUrl.searchParams.set('pitch','4');photoUrl.searchParams.set('fov','75');photoUrl.searchParams.set('key',key);
  const image=await fetch(photoUrl,{signal:AbortSignal.timeout(8000)});
  if(!image.ok || !String(image.headers.get('content-type')).startsWith('image/')) return null;
  const buffer=Buffer.from(await image.arrayBuffer());
  if(buffer.length > 2*1024*1024) return null;
  return {buffer,contentType:image.headers.get('content-type')};
}
async function getPhoto(place) {
  const s=photoSettings();
  if(s.mode==='off') return null;
  if (s.mode==='streetview') return await streetViewPhoto(place) || await googlePhoto(place);
  return await googlePhoto(place) || await streetViewPhoto(place);
}
module.exports={photoSettings,getPhoto};
