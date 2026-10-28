precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in float vCurvature;
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
 if(uMode==0) frag=vec4(vPosition,1.);                          // unnormalized object position (float target)
 else if(uMode==1) frag=vec4(norm*.5+.5,1.);                     // world/object normal
 else if(uMode==2) frag=vec4(vec3(vCurvature),1.);               // signed curvature, mid gray neutral
 else if(uMode==3) frag=vec4(idColor(vId),1.);                   // mesh/material ID
 else if(uMode==4) frag=vec4(vec3(clamp((vPosition.y-uMin.y)/max(.0001,uSize.y),0.,1.)),1.); // elevation
 else if(uMode==5) frag=vec4(.5,.5,1.,1.);                     // flat tangent normal (no high-to-low)
 else frag=vec4(1.,1.,1.,1.);                                  // geometry coverage
}
