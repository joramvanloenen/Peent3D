precision highp float;
in vec2 vUv;
uniform sampler2D uPosition;
uniform sampler2D uNormal;
uniform sampler2D uEdges;
uniform sampler2D uAO;
uniform sampler2D uThickness;
uniform sampler2D uCurvature;
uniform sampler2D uSignedMeanCurvature;
uniform sampler2D uTriangleIndex;
uniform sampler2D uRunoffSegments;
uniform int uRunoffWidth;
uniform int uRunoffStride;
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
uniform int uMeanCurvatureRegion;
uniform float uMeanCurvatureSmoothing;
uniform float uMeanCurvatureCutoff;
uniform float uMeanCurvatureIntensity;
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
// Smooth geometric coverage BEFORE combining with procedural grunge.
// Softness controls the crossfade from localized edge wear to a broad,
// continuous 0..1 falloff. The final threshold belongs AFTER both fields.
float softWearDistance(float d,float width,float softness){
 float x=clamp(d/max(width,.00001),0.,1.);
 float broad=1.-smoothstep(0.,1.,x);
 float focused=softEdge(d,width,softness);
 return mix(focused,broad,clamp(softness,0.,1.));
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
// World-space, mesh-constrained runoff. Each segment is an actual trajectory
// integrated across triangle adjacency from a source on an upper feature edge.
// Unlike tiled 2D drips, there are NO independent spawn rows on the wall.
// Surface velocity follows projected gravity plus weak capillary drift.
float runoffField(vec3 p,vec3 n){
 vec3 encoded=texture(uTriangleIndex,vUv).rgb;
 int tri=int(encoded.r+.5)+256*int(encoded.g+.5)+65536*int(encoded.b+.5);
 int offset=tri*uRunoffStride;
 int count=int(texelFetch(uRunoffSegments,ivec2(offset%uRunoffWidth,offset/uRunoffWidth),0).r+.5);
 float best=0.;
 float vertical=smoothstep(.05,.36,length(vec3(0.,-1.,0.)-n*dot(vec3(0.,-1.,0.),n)));
 float footprint=max(max(length(dFdx(p)),length(dFdy(p)))*.42,.001);
 for(int j=0;j<16;j++){
   if(j>=count)break;
   int aIndex=offset+1+j*3;
   vec4 a=texelFetch(uRunoffSegments,ivec2(aIndex%uRunoffWidth,aIndex/uRunoffWidth),0);
   int bIndex=aIndex+1;
   vec4 b=texelFetch(uRunoffSegments,ivec2(bIndex%uRunoffWidth,bIndex/uRunoffWidth),0);
   int infoIndex=aIndex+2;
   vec4 info=texelFetch(uRunoffSegments,ivec2(infoIndex%uRunoffWidth,infoIndex/uRunoffWidth),0);
   // Only real eligible upper edges can seed a stain.
   if(uAngleThreshold<179.5 && info.z+1e-3<uAngleThreshold)continue; // 180 = unrestricted on legacy streak masks
   float random=hash21(vec2(b.w,uSeed));
   if(random>uDensity)continue;
   vec3 v=b.xyz-a.xyz;
   float segmentLength=max(.00001,length(v));
   float along=clamp(dot(p-a.xyz,v)/max(dot(v,v),1e-9),0.,1.);
   float travel=a.w+along*segmentLength;
   float maxRun=min(info.y,max(.045,uLength*.8)*mix(.36,1.28,random));
   if(travel>maxRun)continue;
   float capillary=(noise2(vec2(travel*max(.5,uScale)*9.,b.w*.47+uSeed))-.5)
                    *(.008*(1.-clamp(uGravity,0.,1.))+.002);
   vec3 unit=v/segmentLength;
   vec3 transverse=normalize(cross(n,unit)+vec3(.00001));
   float lateral=dot(p-(a.xyz+v*along),transverse)-capillary;
   float separation=length(p-(a.xyz+v*along));
   // Stabilize the bead/meniscus at the physical ledge, taper with travel.
   float radius=max(.0025,uWidth*.11)*mix(.7,1.36,info.x)
     *mix(1.28,.62,clamp(travel/max(maxRun,.001),0.,1.));
   float core=1.-smoothstep(max(0.,radius-footprint),radius+footprint,abs(lateral));
   float halo=1.-smoothstep(radius+footprint,radius*3.2+footprint,abs(lateral));
   float within=1.-smoothstep(radius*1.5+footprint,radius*2.7+footprint,separation);
   float bead=1.-smoothstep(0.,radius*4.+footprint,travel);
   float endFade=1.-smoothstep(maxRun*.74,maxRun,travel);
   float narrow=(core*.78+halo*.19)*within;
   float stain=(narrow+bead*.14)*endFade*vertical;
   best=max(best,stain);
 }
 return clamp(best,0.,1.);
}
// Breakup position is the centre of a coverage-domain band: 0=outside,
// 1=the physical worn-edge core. The band is deliberately NOT clamped
// inside [0,1]: at position 1 the upper shoulder MUST extend beyond 1,
// otherwise smoothstep() always zeros the breakup at the exact edge.
// Original defaults retain the smooth solid core; users can now chip it.
float transitionBreakup(float coverage,float grunge,float edgeCoverage){
 float halfWidth=clamp(uBreakupWidth,.01,2.)*.5;
 float centre=clamp(uBreakupPosition,0.,1.);
 float lo=centre-halfWidth;
 float hi=centre+halfWidth;
 float feather=min(.085,(hi-lo)*.22);
 float band=smoothstep(lo,lo+feather,edgeCoverage)*
           (1.-smoothstep(hi-feather,hi,edgeCoverage));
 // Grunge remains a soft 0..1 field during combination. Hardness narrows
 // its transition without binary thresholding; final contrast happens after.
 float softness=mix(.38,.08,clamp(uBreakupHardness,0.,1.));
 float breakupNoise=smoothstep(.5-softness,.5+softness,grunge);
 return mix(coverage,coverage*breakupNoise,clamp(uBreakup,0.,1.)*band);
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
 bool requiresEdges=(uMask==1||uMask==2||uMask==10||uMask==11);
 bool requiresAO=(uMask==1||uMask==3||uMask==9||uMask==10||uMask==11);
 bool requiresHeight=(uMask==4||uMask==5||uMask==10);
 bool requiresNoise=(uMask==7||uMask==10||uMask==11||uBreakup>0.);
 if(requiresEdges){
   vec4 edges=texture(uEdges,vUv);
   if(uMask==1)convex=softWearDistance(edges.r,uEdgeDistance,uSoftness)*smoothstep(uAngleThreshold,uAngleThreshold+12.,edges.b);
   if(uMask!=1)concave=softEdge(edges.g,uEdgeDistance*1.5,uSoftness)*smoothstep(uAngleThreshold,uAngleThreshold+12.,edges.a);
 }
 if(requiresAO)cavity=1.-texture(uAO,vUv).r;
 if(requiresHeight)height=clamp((p.y-uMin.y)/max(uSize.y,.0001),0.,1.);
 if(requiresNoise){
   fine=noise3(p*max(.05,uScale)*max(.2,uBreakupScale)*6.+uSeed,n);
   if(uMask==7||uMask==10||uMask==11)broad=noise3(p*max(.05,uScale)*1.2+uSeed,n);
 }
 if(uMask==8||uMask==9||uMask==10)vertical=runoffField(p,n);
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
 else if(uMask==9)result=vertical*mix(.56,1.,clamp(cavity*.95,0.,1.));
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
 else if(uMask==13){
   vec3 scales=texture(uSignedMeanCurvature,vUv).rgb;
   float t=clamp(uMeanCurvatureSmoothing,0.,1.)*2.;
   float normalized=t<=1.?mix(scales.r,scales.g,t):mix(scales.g,scales.b,t-1.);
   float signedH=(normalized-.5)*2.*uMeanCurvatureIntensity;
   float magnitude=uMeanCurvatureRegion==1?-signedH:
                   uMeanCurvatureRegion==2?abs(signedH):signedH;
   float cutoff=clamp(uMeanCurvatureCutoff,0.,.99);
   result=uMeanCurvatureRegion==3
     ?clamp(.5+.5*signedH,0.,1.)
     :smoothstep(cutoff,cutoff+.20,max(0.,magnitude));
 }
 // Edge wear: (1) soft geometric distance, (2) soft grunge,
 // (3) combine with the adjustable breakup band, (4) final contrast.
 // Applying contrast before combining was making chipped boundaries harsh,
 // preventing fine grunge from naturally shifting the distance falloff.
 if(uMask==1){
   if(uBreakup>0.)result=transitionBreakup(result,fine,convex);
   result=clamp((result-.5)*uContrast+.5,0.,1.);
 }else{
   // Retain existing processing of all other smart-mask generators.
   result=clamp((result-.5)*uContrast+.5,0.,1.);
   if(uBreakup>0. && (uMask<=7||uMask==10||uMask==11||uMask==13)){
     float softness=mix(.28,.012,clamp(uBreakupHardness,0.,1.));
     result*=mix(1.,smoothstep(.5-softness,.5+softness,fine),uBreakup);
   }
 }
 // For edge-aware masks this parameter is a minimum real dihedral angle,
 // already applied when generating the 3D feature-distance atlas. For other
 // masks it limits surface tilt from object-space Y up (180° = unrestricted).
 if(uMask!=1&&uMask!=2&&uMask!=8&&uMask!=9&&uMask!=10&&uMask!=11&&uAngleThreshold<179.5){
   float tilt=degrees(acos(clamp(n.y,-1.,1.)));
   float cutoff=1.-smoothstep(max(0.,uAngleThreshold-3.),uAngleThreshold+3.,tilt);
   result*=cutoff;
 }
 if(uInvert==1)result=1.-result;
 frag=vec4(vec3(clamp(result,0.,1.)),1.);
}
