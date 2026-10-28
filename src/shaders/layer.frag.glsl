precision highp float;
in vec2 vUv;
uniform sampler2D uPrevious;
uniform sampler2D uPosition;
uniform sampler2D uNormal;
uniform sampler2D uSmartMask;
uniform sampler2D uPaint;
uniform sampler2D uImage;
uniform int uHasImage;
uniform int uMode;
uniform int uHasPrevious;
uniform int uProjection;
uniform vec3 uColor;
uniform float uRoughness;
uniform float uMetallic;
uniform float uHeight;
uniform float uOpacity;
uniform float uScale;
uniform float uSeed;
uniform float uStrength;
out vec4 frag;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){float s=0.,a=.5;for(int k=0;k<4;k++){s+=a*noise2(p);p=p*2.03+vec2(11.,5.);a*=.5;}return s/.9375;}
vec3 triplanarImage(vec3 p,vec3 n) {
 vec3 w=pow(abs(n),vec3(4.));w/=max(w.x+w.y+w.z,1.e-5);
 return texture(uImage,p.zy).rgb*w.x+texture(uImage,p.xz).rgb*w.y+texture(uImage,p.xy).rgb*w.z;
}
float triplanarNoise(vec3 p,vec3 n){
 vec3 w=pow(abs(n),vec3(4.));w/=max(w.x+w.y+w.z,1.e-5);
 return w.x*fbm(p.zy)+w.y*fbm(p.xz)+w.z*fbm(p.xy);
}
void main(){
 vec4 pos=texture(uPosition,vUv);
 if(pos.a<.5){frag=vec4(0.);return;}
 vec3 n=normalize(texture(uNormal,vUv).rgb*2.-1.);
 float mask=texture(uSmartMask,vUv).r*texture(uPaint,vUv).r*uOpacity;
 vec4 previous=uHasPrevious==1?texture(uPrevious,vUv):vec4(uMode==0?vec3(.65):uMode==1?vec3(.65):vec3(0.),1.);
 float noiseValue=uProjection==1?triplanarNoise(pos.xyz*uScale*3.+uSeed,n):fbm(vUv*uScale*4.+uSeed);
 float variation=(noiseValue-.5)*uStrength;
 vec3 value=vec3(0.);
 if(uMode==0) {
   vec3 image=uHasImage==1?(uProjection==1?triplanarImage(pos.xyz*uScale,n):texture(uImage,vUv*uScale).rgb):vec3(1.);
   value=clamp(uColor*image*(1.+variation),0.,1.);
 }else if(uMode==1)value=vec3(clamp(uRoughness+variation*.25,.02,1.));
 else if(uMode==2)value=vec3(clamp(uMetallic,0.,1.));
 else value=vec3(clamp(.5+uHeight+variation*.10,0.,1.));
 frag=vec4(mix(previous.rgb,value,mask),1.);
}
