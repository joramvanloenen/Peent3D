precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in float vCurvature;
in vec3 vSignedMeanCurvature;
in vec3 vAltitude;
in vec3 vBarycentric;
flat in vec3 vEdgeAngles;
flat in int vId;
flat in int vTriangleId;
uniform int uMode;
uniform vec3 uMin;
uniform vec3 uSize;
uniform sampler2D uFeatureSegments;
uniform int uFeatureWidth;
uniform int uFeatureStride;
uniform float uAngleThreshold;
out vec4 frag;
vec3 idColor(int id){
 return vec3(fract(float(id)*.61803398875+.20),
             fract(float(id)*.38196601125+.42),
             fract(float(id)*.75487766625+.63));
}
void main(){
 vec3 norm=normalize(vNormal);
 if(uMode==0) frag=vec4(vPosition,1.);
 else if(uMode==1) frag=vec4(norm*.5+.5,1.);
 else if(uMode==2) frag=vec4(vec3(vCurvature),1.);
 else if(uMode==3) frag=vec4(idColor(vId),1.);
 else if(uMode==4) frag=vec4(vec3(clamp((vPosition.y-uMin.y)/max(.0001,uSize.y),0.,1.)),1.);
 else if(uMode==5) frag=vec4(.5,.5,1.,1.);
 else if(uMode==6) frag=vec4(1.);
 else if(uMode==7) frag=vec4(vSignedMeanCurvature,1.);
 else {
   // Exact Euclidean distance in 3D to actual *finite feature segments*.
   // Unlike per-triangle barycentrics, this is continuous across UV seams,
   // between coplanar triangles, and around corners.
   int start=vTriangleId*uFeatureStride;
   int count=int(texelFetch(uFeatureSegments,ivec2(start%uFeatureWidth,start/uFeatureWidth),0).r+.5);
   float convex=32.,concave=32.,convexAngle=0.,concaveAngle=0.;
   for(int i=0;i<24;i++){
     if(i>=count)break;
     int ia=start+1+i*2;
     vec4 a=texelFetch(uFeatureSegments,ivec2(ia%uFeatureWidth,ia/uFeatureWidth),0);
     int ib=ia+1;
     vec3 b=texelFetch(uFeatureSegments,ivec2(ib%uFeatureWidth,ib/uFeatureWidth),0).xyz;
     float angle=a.w;
     if(abs(angle)<uAngleThreshold)continue;
     vec3 d=b-a.xyz;
     float t=clamp(dot(vPosition-a.xyz,d)/max(dot(d,d),1e-12),0.,1.);
     float dist=length(vPosition-(a.xyz+t*d));
     if(angle>0. && dist<convex){convex=dist;convexAngle=angle;}
     if(angle<0. && dist<concave){concave=dist;concaveAngle=-angle;}
   }
   frag=vec4(convex,concave,convexAngle,concaveAngle);
 }
}
