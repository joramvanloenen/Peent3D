precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform int uMode;
out vec4 frag;
float encodeSRGB(float v){return v<=.0031308?12.92*v:1.055*pow(max(v,0.),1./2.4)-.055;}
void main(){
 vec4 c=texture(uTexture,vUv);
 if(uMode==1)c.rgb=vec3(encodeSRGB(c.r),encodeSRGB(c.g),encodeSRGB(c.b));
 if(uMode==2)c.rgb=c.rrr;
 frag=vec4(clamp(c.rgb,0.,1.),c.a);
}
