precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in float vCurvature;
in vec3 vAltitude;
in vec3 vBarycentric;
flat in vec3 vEdgeAngles;
flat in int vId;
uniform int uMode;
uniform vec3 uMin;
uniform vec3 uSize;
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
 else {
   // UV barycentric * world-space triangle altitude gives edge proximity
   // in consistent model units, independent of UV scaling or texture size.
   vec3 distanceToEdge=max(vBarycentric,0.)*max(vAltitude,0.);
   float convex=32.,concave=32.,angleConvex=0.,angleConcave=0.;
   for(int i=0;i<3;i++){
     float signedAngle=vEdgeAngles[i];
     float d=distanceToEdge[i];
     if(signedAngle>0.5 && d<convex){convex=d;angleConvex=signedAngle;}
     if(signedAngle<-.5 && d<concave){concave=d;angleConcave=-signedAngle;}
   }
   frag=vec4(convex,concave,angleConvex,angleConcave);
 }
}
