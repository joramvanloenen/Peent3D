precision highp float;
in vec2 vUv;
uniform sampler2D uPrevious;
uniform sampler2D uPosition;
uniform sampler2D uNormal;
uniform vec3 uPoint;
uniform vec3 uBrushNormal;
uniform float uRadius;
uniform float uHardness;
uniform float uStrength;
uniform float uValue;
out vec4 frag;
void main(){
 vec4 old=texture(uPrevious,vUv);
 vec4 p=texture(uPosition,vUv);
 if(p.a<.5){frag=old;return;}
 float d=distance(p.xyz,uPoint);
 float inner=uRadius*clamp(uHardness,.01,.99);
 float soft=1.-smoothstep(inner,uRadius,d);
 vec3 n=normalize(texture(uNormal,vUv).rgb*2.-1.);
 float orientation=smoothstep(-.05,.25,dot(n,uBrushNormal));
 float m=soft*orientation*uStrength;
 frag=vec4(vec3(mix(old.r,uValue,m)),1.);
}
