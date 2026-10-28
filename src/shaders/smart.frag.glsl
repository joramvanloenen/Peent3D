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
uniform float uBreakupHardness;
uniform float uBreakupPosition;
uniform float uBreakupWidth;
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
 float pixelFootprint=max(max(fwidth(q.x),fwidth(q.y))*.48,.003);
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
   float coverage=clamp(width/max(pixelFootprint,.001),.14,.85);
   float mark=(1.-smoothstep(max(0.,width-pixelFootprint),width+pixelFootprint,d))*taper*coverage;
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
 // Each stain is a coherent, downward projected path. Streaks start at the
 // exposed top of the object, while leaks can begin below local ledges.
 float freq=max(.2,uScale)*7.;
 float x=p.x*freq;
 float y=(p.y+(1.-uGravity)*p.x*.4)*freq;
 float footprint=max(fwidth(x)*.48,.004);
 float period=max(2.,uLength*7.);
 float row=floor((y-uMin.y*freq)/period);
 float col=floor(x);
 float result=0.;
 for(int k=-1;k<=1;k++){
   float column=col+float(k);
   float random=hash21(vec2(column,seed));
   if(random>uDensity)continue;
   float xc=column+.15+.70*hash21(vec2(column+9.3,seed));
   float variation=hash21(vec2(column,seed+17.));
   float wobble=(noise2(vec2(y*.22,column*.87+seed))-.5)*.14;
   float dist=abs(x-xc-wobble);
   float startY=uMask==8
      ? (uMin.y+uSize.y)*freq - freq*.05*hash21(vec2(column,seed+22.))
      : (row+1.)*period+uMin.y*freq-period*.13*hash21(vec2(column,seed+22.));
   float len=uMask==8
      ? uSize.y*freq*clamp(uLength/2.5,.08,1.)*mix(.28,1.,variation)
      : period*mix(.28,.94,variation);
   float drop=startY-y;
   if(drop<0.||drop>len)continue;
   float taper=mix(1.,.44,clamp(drop/max(.001,len),0.,1.));
   float width=max(.006,uWidth)*mix(.55,1.30,hash21(vec2(column,seed+31.)));
   float radius=width*taper;
   float core=1.-smoothstep(max(0.,radius-footprint),radius+footprint,dist);
   float halo=1.-smoothstep(radius+footprint,radius*2.7+footprint,dist);
   float antialiasCoverage=clamp(radius/max(.001,footprint),.18,1.);
   float endFade=1.-smoothstep(len*.70,len,drop);
   float startFade=smoothstep(0.,max(.08,footprint),drop);
   float stain=(core*.72+halo*.15)*antialiasCoverage*endFade*startFade;
   result=max(result,stain);
 }
 return clamp(result,0.,1.);
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
// Keep the fully worn core intact; only chip the partially worn transition.
// Position/width are measured in mask intensity (0=unworn, 1=fully worn).
float transitionBreakup(float coverage,float grunge,float edgeCoverage){
 float halfWidth=clamp(uBreakupWidth,.02,.95)*.5;
 float lo=clamp(uBreakupPosition-halfWidth,.001,.94);
 float hi=clamp(uBreakupPosition+halfWidth,lo+.02,.975);
 float feather=min(.085,(hi-lo)*.22);
 float band=smoothstep(lo,lo+feather,edgeCoverage)*
           (1.-smoothstep(hi-feather,hi,edgeCoverage));
 // Hardness controls grunge's contrast/threshold, independent from intensity.
 float softness=mix(.28,.012,clamp(uBreakupHardness,0.,1.));
 float breakupNoise=smoothstep(.5-softness,.5+softness,grunge);
 return mix(coverage,coverage*breakupNoise,uBreakup*band);
}
void main(){
 vec4 pos=texture(uPosition,vUv);
 if(pos.a<.5){frag=vec4(0.);return;}
 // Even a full-fill mask may use the optional orientation angle threshold.
 vec3 p=pos.xyz;
 vec3 n=normalize(texture(uNormal,vUv).rgb*2.-1.);
 float result=1.;
 float fine=0.,broad=0.,convex=0.,concave=0.,vertical=0.,cavity=0.,height=0.;
 // Compute only the features actually requested by this generator.
 bool requiresEdges=(uMask==1||uMask==2||uMask==9||uMask==10||uMask==11);
 bool requiresAO=(uMask==1||uMask==3||uMask==9||uMask==10||uMask==11);
 bool requiresHeight=(uMask==4||uMask==5||uMask==10);
 bool requiresNoise=(uMask==7||uMask==10||uMask==11||uBreakup>0.);
 if(requiresEdges){
   vec4 edges=texture(uEdges,vUv);
   if(uMask==1)convex=softEdge(edges.r,uEdgeDistance,uSoftness)*smoothstep(uAngleThreshold,uAngleThreshold+12.,edges.b);
   if(uMask!=1)concave=softEdge(edges.g,uEdgeDistance*1.5,uSoftness)*smoothstep(uAngleThreshold,uAngleThreshold+12.,edges.a);
 }
 if(requiresAO)cavity=1.-texture(uAO,vUv).r;
 if(requiresHeight)height=clamp((p.y-uMin.y)/max(uSize.y,.0001),0.,1.);
 if(requiresNoise){
   fine=noise3(p*max(.05,uScale)*max(.2,uBreakupScale)*6.+uSeed,n);
   if(uMask==7||uMask==10||uMask==11)broad=noise3(p*max(.05,uScale)*1.2+uSeed,n);
 }
 if(uMask==8||uMask==9||uMask==10)vertical=verticalRunoff(p,n);
 if(uMask==1){
   float ao=1.-cavity;
   result=convex*mix(1.,ao,uAOProtect);
 }else if(uMask==2)result=concave;
 else if(uMask==3)result=clamp(pow(cavity,.65)*1.25,0.,1.);
 else if(uMask==4)result=smoothstep(.2,.85,height);
 else if(uMask==5)result=1.-smoothstep(.12,.73,height);
 else if(uMask==6)result=1.-smoothstep(.15,.75,texture(uThickness,vUv).r);
 else if(uMask==7)result=broad;
 else if(uMask==8)result=vertical;
 else if(uMask==9)result=vertical*mix(.65,1.,clamp(cavity*.85+concave*.95,0.,1.));
 else if(uMask==10){
   float pockets=clamp(cavity*.86+concave*.94+(1.-height)*.13,0.,1.);
   float pinholes=noise3(p*max(.05,uScale)*11.0+uSeed+4.1,n);
   float oxideField=broad*.45+fine*.35+pinholes*.20;
   float corrosion=smoothstep(.51,.70,oxideField+pockets*.12);
   result=clamp(corrosion*mix(.17,.43,uCavity)+pockets*(.52+.28*corrosion)+vertical*.22,0.,1.);
 }else if(uMask==11){
   float up=pow(clamp(n.y,0.,1.),mix(5.,.45,uTopBias));
   float trapped=clamp(cavity*.60+concave*.28,0.,1.);
   result=clamp(up*(.65+.35*broad)+trapped*uCavity,0.,1.);
 }else if(uMask==12)result=scratches3(p,n);
 result=clamp((result-.5)*uContrast+.5,0.,1.);
 if(uBreakup>0.){
   if(uMask==1)result=transitionBreakup(result,fine,convex);
   else if(uMask<=7||uMask==10||uMask==11){
     float softness=mix(.28,.012,clamp(uBreakupHardness,0.,1.));
     result*=mix(1.,smoothstep(.5-softness,.5+softness,fine),uBreakup);
   }
 }
 // For edge-aware masks this parameter is a minimum real dihedral angle,
 // already applied when generating the 3D feature-distance atlas. For other
 // masks it limits surface tilt from object-space Y up (180° = unrestricted).
 if(uMask!=1&&uMask!=2&&uMask!=9&&uMask!=10&&uMask!=11&&uAngleThreshold<179.5){
   float tilt=degrees(acos(clamp(n.y,-1.,1.)));
   float cutoff=1.-smoothstep(max(0.,uAngleThreshold-3.),uAngleThreshold+3.,tilt);
   result*=cutoff;
 }
 if(uInvert==1)result=1.-result;
 frag=vec4(vec3(clamp(result,0.,1.)),1.);
}
