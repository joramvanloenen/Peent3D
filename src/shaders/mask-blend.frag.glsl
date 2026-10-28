precision highp float;
in vec2 vUv;
uniform sampler2D uPrevious;
uniform sampler2D uEffect;
uniform int uMode;
uniform float uOpacity;
out vec4 frag;
void main(){
 float base=texture(uPrevious,vUv).r;
 float mask=texture(uEffect,vUv).r;
 float a=clamp(uOpacity,0.,1.);
 float value=mask;
 if(uMode==0)value=mix(base,mask,a);
 else if(uMode==1)value=base*mix(1.,mask,a);
 else if(uMode==2)value=min(1.,base+mask*a);
 else if(uMode==3)value=base*(1.-mask*a);
 else if(uMode==4)value=max(base,mask*a);
 else if(uMode==5)value=min(base,mix(1.,mask,a));
 frag=vec4(vec3(clamp(value,0.,1.)),1.);
}
