precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uTexel;
out vec4 frag;
void main(){
 vec4 center=texture(uTexture,vUv);
 if(center.a>.5){frag=center;return;}
 vec4 best=center;
 float dist=100.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   if(x==0&&y==0)continue;
   vec4 p=texture(uTexture,vUv+vec2(float(x),float(y))*uTexel);
   float d=float(x*x+y*y);
   if(p.a>.5&&d<dist){best=p;dist=d;}
 }
 frag=best;
}
