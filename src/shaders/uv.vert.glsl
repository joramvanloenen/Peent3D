precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
in float aCurvature;
in float aId;
in float aTriangleId;
in vec3 aEdgeAngles;
in vec3 aEdgeAltitude;
in vec3 aBarycentric;
out vec3 vPosition;
out vec3 vNormal;
out float vCurvature;
out vec3 vAltitude;
out vec3 vBarycentric;
flat out vec3 vEdgeAngles;
flat out int vId;
flat out int vTriangleId;
void main(){
 vPosition=position;
 vNormal=normalize(normal);
 vCurvature=aCurvature;
 vId=int(aId+.5);
 vTriangleId=int(aTriangleId+.5);
 vEdgeAngles=aEdgeAngles;
 vAltitude=aEdgeAltitude;
 vBarycentric=aBarycentric;
 gl_Position=vec4(uv*2.-1.,0.,1.);
}
