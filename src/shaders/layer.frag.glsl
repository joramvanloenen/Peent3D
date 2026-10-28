precision highp float;
in vec2 vUv;
uniform sampler2D uPrevious;
uniform sampler2D uPosition;
uniform sampler2D uNormal;
uniform sampler2D uCurvature;
uniform sampler2D uAO;
uniform sampler2D uThickness;
uniform sampler2D uPaint;
uniform sampler2D uImage;
uniform int uHasImage;
uniform float uBreakup;
uniform int uInvert;
uniform int uMode;
uniform int uHasPrevious;
uniform int uMask;
uniform int uProjection;
uniform vec3 uColor;
uniform float uRoughness;
uniform float uMetallic;
uniform float uHeight;
uniform float uOpacity;
uniform float uScale;
uniform float uContrast;
uniform float uSeed;
uniform float uStrength;
uniform vec3 uMin;
uniform vec3 uSize;
out vec4 frag;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p) {
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
            mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p) {
 float v=0.,a=.5;
 for(int i=0;i<4;i++){v+=noise(p)*a;p=p*2.03+vec2(11.1,5.7);a*=.5;}
 return v/.9375;
}
vec3 imageTriplanar(vec3 p,vec3 n){vec3 w=pow(abs(n),vec3(4.));w/=max(w.x+w.y+w.z,.0001);return texture(uImage,p.zy).rgb*w.x+texture(uImage,p.xz).rgb*w.y+texture(uImage,p.xy).rgb*w.z;}
float triplanar(vec3 p,vec3 n){
 vec3 w=pow(abs(n),vec3(4.));
 w/=max(w.x+w.y+w.z,.0001);
 return w.x*fbm(p.zy)+w.y*fbm(p.xz)+w.z*fbm(p.xy);
}
void main(){
 vec4 pos=texture(uPosition,vUv);
 if(pos.a<.5){frag=vec4(0.);return;}
 vec3 n=normalize(texture(uNormal,vUv).rgb*2.-1.);
 vec2 noiseUV=vUv*uScale*4.+uSeed;
 float grain=uProjection==1?triplanar(pos.xyz*uScale*3.+uSeed,n):fbm(noiseUV);
 float curved=texture(uCurvature,vUv).r;
 float ao=texture(uAO,vUv).r;
 float thickness=texture(uThickness,vUv).r;
 float height=clamp((pos.y-uMin.y)/max(.0001,uSize.y),0.,1.);
 float mask=1.;
 if(uMask==1)mask=smoothstep(.47,.78,curved);
 if(uMask==2)mask=1.-smoothstep(.20,.52,curved);
 if(uMask==3)mask=1.-smoothstep(.35,.96,ao);
 if(uMask==4)mask=smoothstep(.1,.90,height);
 if(uMask==5)mask=1.-smoothstep(.15,.75,height);
 if(uMask==6)mask=1.-smoothstep(.20,.85,thickness);
 if(uMask==7)mask=grain;
 if(uMask!=0){mask=clamp((mask-.5)*uContrast+.5,0.,1.);mask*=mix(1.,smoothstep(.15,.75,grain),uBreakup);if(uInvert==1)mask=1.-mask;}
 mask*=texture(uPaint,vUv).r;
 mask*=uOpacity;
 vec4 old=uHasPrevious==1?texture(uPrevious,vUv):vec4(uMode==0?vec3(.65):uMode==1?vec3(.65):vec3(0.),1.);
 float variation=(grain-.5)*uStrength;
 vec3 imageColor=uHasImage==1?(uProjection==1?imageTriplanar(pos.xyz*uScale,n):texture(uImage,vUv*uScale).rgb):vec3(1.);
 vec3 value=uMode==0?clamp(uColor*imageColor*(1.+variation),0.,1.):
            uMode==1?vec3(clamp(uRoughness+variation*.4,.02,1.)):
            uMode==2?vec3(clamp(uMetallic,0.,1.)):
                     vec3(clamp(.5+uHeight+variation*.15,0.,1.));
 frag=vec4(mix(old.rgb,value,mask),1.);
}
