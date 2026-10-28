precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform int uMode;
uniform vec3 uMin;
uniform vec3 uSize;
out vec4 frag;
float encodeSRGB(float v){return v<=.0031308?12.92*v:1.055*pow(max(v,0.),1./2.4)-.055;}
void main(){
 vec4 c=texture(uTexture,vUv);
 if(uMode==1)c.rgb=vec3(encodeSRGB(c.r),encodeSRGB(c.g),encodeSRGB(c.b));
 if(uMode==2)c.rgb=c.rrr;
 if(uMode==3)c.rgb=(c.rgb-uMin)/max(uSize,vec3(0.00001));
 frag=vec4(clamp(c.rgb,0.,1.),c.a);
}
