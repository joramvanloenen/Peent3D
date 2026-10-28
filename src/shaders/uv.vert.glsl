precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
in float aCurvature;
in float aId;
out vec3 vPosition;
out vec3 vNormal;
out float vCurvature;
flat out int vId;
void main(){
 vPosition=position;
 vNormal=normalize(normal);
 vCurvature=aCurvature;
 vId=int(aId+.5);
 gl_Position=vec4(uv*2.-1.,0.,1.);
}
