precision highp float;
in vec2 vUv;
uniform sampler2D uPosition;
uniform sampler2D uNormal;
uniform sampler2D uEdges;
uniform sampler2D uAO;
uniform sampler2D uThickness;
uniform sampler2D uCurvature;
uniform int uMask;
uniform int uInvert;
uniform float uSeed;
uniform float uScale;
uniform float uContrast;
uniform float uBreakup;
uniform float uEdgeDistance;
uniform float uAngleThreshold;
uniform float uSoftness;
uniform float uDensity;
uniform float uLength;
uniform float uWidth;
uniform float uDirection;
uniform float uGravity;
uniform float uCavity;
uniform float uAOProtect;
uniform float uTopBias;
uniform float uBreakupScale;
uniform vec3 uMin;
uniform vec3 uSize;
out vec4 frag;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
vec2 hash22(vec2 p){return vec2(hash21(p),hash21(p+vec2(19.17,47.53)));}
float noise2(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
            mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
 float v=0.,a=.5;
 for(int i=0;i<4;i++){v+=noise2(p)*a;p=p*2.07+vec2(14.12,8.73);a*=.5;}
 return v/.9375;
}
float noise3(vec3 p,vec3 n){
 vec3 w=pow(abs(n),vec3(3.));
 w/=max(dot(w,vec3(1.)),.00001);
 return w.x*fbm(p.zy)+w.y*fbm(p.xz)+w.z*fbm(p.xy);
}
float softEdge(float d,float width,float softness){
 float inner=width*(1.-clamp(softness,.01,.95));
 return 1.-smoothstep(inner,max(inner+.00001,width),d);
}
float scratchPlane(vec2 p,float seed){
 vec2 q=p*max(.01,uScale)*5.;
 q.x+=.075*(fbm(q*1.3+seed)-.5);
 vec2 cell=floor(q);
 float pixelFootprint=max(length(fwidth(q))*.50,.003);
 float result=0.;
 for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
   vec2 c=cell+vec2(float(x),float(y));
   vec2 rnd=hash22(c+seed);
   if(rnd.x>uDensity)continue;
   vec2 start=c+vec2(.1)+rnd*.8;
   float rotation=radians(uDirection)+(rnd.y-.5)*.95;
   vec2 dir=vec2(cos(rotation),sin(rotation));
   float len=max(.02,uLength)*mix(.25,1.15,hash21(c+seed+3.1));
   vec2 rel=q-start;
   float along=clamp(dot(rel,dir),0.,len);
   vec2 perpendicular=rel-dir*along;
   float waviness=(noise2(vec2(along*3.,rnd.y*9.)+seed)-.5)*.055;
   float width=max(.008,uWidth)*mix(.60,1.25,hash21(c+seed+7.2));
   float d=abs(dot(perpendicular,vec2(-dir.y,dir.x))+waviness);
   float taper=pow(max(0.,1.-along/len),.25);
   float mark=(1.-smoothstep(max(0.,width*.10-pixelFootprint*.30),width+pixelFootprint,d))*taper;
   result=max(result,mark);
 }
 return result;
}
float scratches3(vec3 p,vec3 n){
 vec3 w=pow(abs(n),vec3(5.));w/=max(dot(w,vec3(1.)),.00001);
 return w.x*scratchPlane(p.zy,uSeed+1.1)+
        w.y*scratchPlane(p.xz,uSeed+7.1)+
        w.z*scratchPlane(p.xy,uSeed+13.1);
}
float dripPlane(vec2 p,float seed){
 float freq=max(.2,uScale)*9.;
 float x=p.x*freq;
 float y=(p.y+(1.-uGravity)*p.x*.7)*freq;
 float pixelFootprint=max(fwidth(x)*.55,.004);
 float period=max(1.2,uLength*9.);
 float row=floor(y/period);
 float col=floor(x);
 float result=0.;
 for(int k=-1;k<=1;k++){
   float column=col+float(k);
   float random=hash21(vec2(column,seed));
   if(random>uDensity)continue;
   float xc=column+.15+.70*hash21(vec2(column+9.3,seed));
   float wobble=(noise2(vec2(y*.14,column*.87+seed))-.5)*.24;
   float dist=abs(x-xc-wobble);
   float dripLength=period*mix(.22,.96,hash21(vec2(column,seed+17.)));
   float top=(row+1.)*period-.2*period*hash21(vec2(column,seed+22.));
   float drop=top-y;
   float endpoint=1.-smoothstep(dripLength*.75,dripLength,drop);
   float start=smoothstep(0.,.18,max(drop,0.));
   float diameter=max(.02,uWidth)*mix(.65,1.35,hash21(vec2(column,seed+31.)));
   float tapered=mix(1.,.24,clamp(drop/max(.01,dripLength),0.,1.));
   float line=1.-smoothstep(max(0.,diameter*.10-pixelFootprint*.3),diameter+pixelFootprint,dist/max(.22,tapered));
   result=max(result,line*start*endpoint*step(0.,drop));
 }
 return result;
}
float verticalRunoff(vec3 p,vec3 n){
 // Project onto vertical X/Y or Z/Y planes, suppress horizontal surfaces.
 float wx=pow(abs(n.x),4.),wz=pow(abs(n.z),4.);
 float total=wx+wz;
 if(total<.00001)return 0.;
 wx/=total;wz/=total;
 return (wx*dripPlane(p.zy,uSeed+5.)+wz*dripPlane(p.xy,uSeed+11.))*
        smoothstep(.12,.60,1.-abs(n.y));
}
void main(){
 vec4 pos=texture(uPosition,vUv);
 if(pos.a<.5){frag=vec4(0.);return;}
 vec3 p=pos.xyz;
 vec3 n=normalize(texture(uNormal,vUv).rgb*2.-1.);
 vec4 edges=texture(uEdges,vUv);
 float ao=texture(uAO,vUv).r;
 float cavity=1.-ao;
 float height=clamp((p.y-uMin.y)/max(uSize.y,.0001),0.,1.);
 float fine=noise3(p*max(.05,uScale)*max(.2,uBreakupScale)*6.+uSeed,n);
 float broad=noise3(p*max(.05,uScale)*1.2+uSeed,n);
 float convex=softEdge(edges.r,uEdgeDistance,uSoftness)*
              smoothstep(uAngleThreshold,uAngleThreshold+12.,edges.b);
 float concave=softEdge(edges.g,uEdgeDistance*1.5,uSoftness)*
               smoothstep(uAngleThreshold,uAngleThreshold+12.,edges.a);
 float vertical=verticalRunoff(p,n);
 float result=1.;
 if(uMask==1)result=convex*mix(1.,ao,uAOProtect);
 else if(uMask==2)result=concave;
 else if(uMask==3)result=clamp(pow(cavity,.65)*1.25,0.,1.);
 else if(uMask==4)result=smoothstep(.2,.85,height);
 else if(uMask==5)result=1.-smoothstep(.12,.73,height);
 else if(uMask==6)result=1.-smoothstep(.15,.75,texture(uThickness,vUv).r);
 else if(uMask==7)result=broad;
 else if(uMask==8)result=vertical;
 else if(uMask==9)result=vertical*mix(.65,1.,clamp(cavity*.9+concave*.9,0.,1.));
 else if(uMask==10){
   float pockets=clamp(cavity*.65+concave*.65+(1.-height)*.12,0.,1.);
   float pinholes=noise3(p*max(.05,uScale)*12.0+uSeed+4.1,n);
   float oxideField=broad*.44+fine*.36+pinholes*.20 + pockets*.12;
   float corrosion=smoothstep(.43,.67,oxideField);
   // Local micro-pitting combined with geometric water traps and thin gravity trails.
   result=clamp(corrosion*mix(.37,.85,uCavity)+pockets*.48+vertical*.25,0.,1.);
 }else if(uMask==11){
   float up=pow(clamp(n.y,0.,1.),mix(5.,.45,uTopBias));
   float trapped=clamp(cavity*.60+concave*.28,0.,1.);
   result=clamp(up*(.65+.35*broad)+trapped*uCavity,0.,1.);
 }else if(uMask==12)result=scratches3(p,n);
 if(uMask!=0){
   if(uMask<=7 || uMask==10 || uMask==11){
     float grunge=smoothstep(.1,.85,fine);
     result*=mix(1.,grunge,uBreakup);
   }
   result=clamp((result-.5)*uContrast+.5,0.,1.);
   if(uInvert==1)result=1.-result;
 }
 frag=vec4(vec3(clamp(result,0.,1.)),1.);
}
