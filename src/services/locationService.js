H.services.location={
 distance(task,location){
  if(task.type==='online'||!location)return null;
  if(CLOUD_ENABLED)return task.distance_meters==null?null:Number(task.distance_meters)/1000;
  if(task.lat==null||task.lng==null)return null;
  return haversine(location.lat,location.lng,Number(task.lat),Number(task.lng));
 },
 locate(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('当前浏览器不支持定位'));navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,label:'当前位置',coordinate_system:'WGS84'}),e=>reject(new Error(e.code===1?'你拒绝了定位授权，仍可按城市浏览':'定位失败，请稍后重试')),{timeout:8000,maximumAge:60000});});}
};
