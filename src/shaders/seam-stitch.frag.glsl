precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uPosition;
uniform sampler2D uTriangleIndex;
uniform sampler2D uUVSeams;
uniform int uAtlasWidth;
uniform int uAtlasStride;
uniform float uResolution;
uniform float uSeamPixels;
out vec4 frag;
vec4 entryAt(int i){
 return texelFetch(uUVSeams,ivec2(i%uAtlasWidth,i/uAtlasWidth),0);
}
void main(){
 float own=texture(uSource,vUv).r;
 vec4 pos=texture(uPosition,vUv);
 if(pos.a<.5){frag=vec4(vec3(own),1.);return;}
 vec3 encoded=texture(uTriangleIndex,vUv).rgb;
 int triangle=int(encoded.r+.5)+256*int(encoded.g+.5)+65536*int(encoded.b+.5);
 int offset=triangle*uAtlasStride;
 vec4 header=entryAt(offset);
 int count=int(header.x+.5);
 if(count==0){frag=vec4(vec3(own),1.);return;}
 float influence=0.;
 float accum=0.;
 for(int k=0;k<3;k++){
  if(k>=count)break;
  int base=offset+1+k*4;
  vec4 a=entryAt(base),b=entryAt(base+1);
  vec4 side=entryAt(base+2),inside=entryAt(base+3);
  vec3 edge=b.xyz-a.xyz;
  float t=clamp(dot(pos.xyz-a.xyz,edge)/max(dot(edge,edge),1.e-10),0.,1.);
  float dist=length(pos.xyz-(a.xyz+edge*t));
  float worldRadius=max(1.e-5,a.w*uSeamPixels/max(uResolution,1.));
  if(dist>worldRadius)continue;
  // Sample just inside the opposite UV island instead of mixing with
  // transparent atlas background on the split UV border.
  vec2 target=mix(side.xy,side.zw,t);
  float inset=min(inside.z*.28,max(dist/max(b.w,1.e-8)*inside.z,1.5/uResolution));
  target+=inside.xy*inset;
  if(any(lessThan(target,vec2(0.)))||any(greaterThan(target,vec2(1.))))continue;
  if(texture(uPosition,target).a<.5)continue;
  float partner=texture(uSource,target).r;
  // Symmetric attenuation: both sides converge to the same midpoint at
  // the physical seam; away from the seam the original texture is retained.
  float weight=1.-smoothstep(0.,worldRadius,dist);
  accum+=partner*weight;
  influence+=weight;
 }
 float repaired=own;
 if(influence>0.){
  float average=accum/influence;
  // At the seam both islands must converge to the SAME midpoint, not only
  // move 25% toward it (the previous calculation left a visible discontinuity).
  repaired=mix(own,average,clamp(influence,0.,1.)*.5);
 }
 frag=vec4(vec3(clamp(repaired,0.,1.)),1.);
}
