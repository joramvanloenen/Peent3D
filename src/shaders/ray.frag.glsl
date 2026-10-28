precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uPosition;
uniform sampler2D uNormal;
uniform sampler2D uNodes;
uniform sampler2D uTriangles;
uniform int uNodesWidth;
uniform int uTrianglesWidth;
uniform int uSamples;
uniform int uMode;
uniform float uDistance;
out vec4 frag;
vec4 fetchNode(int i) { return texelFetch(uNodes,ivec2(i%uNodesWidth,i/uNodesWidth),0); }
vec4 fetchTri(int i) { return texelFetch(uTriangles,ivec2(i%uTrianglesWidth,i/uTrianglesWidth),0); }
bool boxHit(vec3 o,vec3 d,vec3 lo,vec3 hi,float maxDist) {
 vec3 inv=1./(d+vec3(1.e-8));
 vec3 a=(lo-o)*inv;
 vec3 b=(hi-o)*inv;
 vec3 tmin=min(a,b),tmax=max(a,b);
 float nearT=max(max(tmin.x,tmin.y),tmin.z);
 float farT=min(min(tmax.x,tmax.y),tmax.z);
 return farT>=max(nearT,0.) && nearT<maxDist;
}
float triHit(vec3 o,vec3 d,vec3 v0,vec3 v1,vec3 v2) {
 vec3 e1=v1-v0,e2=v2-v0,p=cross(d,e2);
 float det=dot(e1,p);
 if(abs(det)<1.e-8)return -1.;
 float inv=1./det;
 vec3 t=o-v0;
 float u=dot(t,p)*inv;
 if(u<0. || u>1.)return -1.;
 vec3 q=cross(t,e1);
 float v=dot(d,q)*inv;
 if(v<0. || u+v>1.)return -1.;
 float hit=dot(e2,q)*inv;
 return hit>.003 ? hit : -1.;
}
float traceMesh(vec3 origin,vec3 dir,float limit){
 int stack[48];int top=0;
 stack[top++]=0;
 float closest=limit;
 for(int iter=0;iter<192;iter++){
  if(top<=0)break;
  int id=stack[--top];
  vec4 a=fetchNode(id*3);
  vec4 b=fetchNode(id*3+1);
  if(!boxHit(origin,dir,a.xyz,b.xyz,closest))continue;
  int left=int(a.w+.5);
  int right=int(b.w+.5);
  if(left<0){
   vec4 m=fetchNode(id*3+2);
   int first=int(m.x+.5),count=int(m.y+.5);
   for(int j=0;j<4;j++){
    if(j>=count)break;
    int ix=(first+j)*3;
    float hit=triHit(origin,dir,fetchTri(ix).xyz,fetchTri(ix+1).xyz,fetchTri(ix+2).xyz);
    if(hit>0.&&hit<closest)closest=hit;
   }
  }else{
   if(top<46){stack[top++]=left;stack[top++]=right;}
  }
 }
 return closest<limit ? closest : -1.;
}
float rand(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec4 p=texture(uPosition,vUv);
 if(p.a<.5){frag=vec4(0.);return;}
 vec3 n=normalize(texture(uNormal,vUv).rgb*2.-1.);
 vec3 t=normalize(cross(abs(n.y)<.95 ? vec3(0.,1.,0.) : vec3(1.,0.,0.),n));
 vec3 b=normalize(cross(n,t));
 float seed=rand(vUv*vec2(272.34,918.28));
 float occ=0.,thick=0.,thickN=0.;
 vec3 bent=vec3(0.);
 vec3 origin=p.xyz+n*.005;
 for(int i=0;i<64;i++){
  if(i>=uSamples)break;
  float f=(float(i)+.5)/float(uSamples);
  float theta=6.2831853*fract(float(i)*.61803398875+seed);
  float r=sqrt(f),z=sqrt(1.-f);
  vec3 local=vec3(cos(theta)*r,sin(theta)*r,z);
  vec3 dir=normalize(t*local.x+b*local.y+n*local.z);
  if(uMode==2){
    dir=normalize(-n*.70 + (dir-n*local.z)*.30);
    float distance=traceMesh(p.xyz-n*.007,dir,uDistance);
    if(distance>0.){thick+=distance;thickN+=1.;}
  }else{
    float hit=traceMesh(origin,dir,uDistance);
    if(hit>0.)occ+=1.-smoothstep(0.,uDistance,hit);
    else bent+=dir;
  }
 }
 float ao=1.-occ/float(uSamples);
 if(uMode==0)frag=vec4(vec3(ao),1.);
 else if(uMode==1)frag=vec4(normalize(length(bent)>.001?bent:n)*.5+.5,1.);
 else {
   // Thin if we hit an opposing surface nearby. Open surfaces have no measurable thickness.
   float v=thickN>0.?clamp((thick/thickN)/uDistance,0.,1.):0.;
   frag=vec4(vec3(v),1.);
 }
}
