precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec2 aUvCentroid;
uniform vec2 uUVTexel;
in float aCurvature;
in vec3 aSignedMeanCurvature;
in float aId;
in float aTriangleId;
in vec3 aEdgeAngles;
in vec3 aEdgeAltitude;
in vec3 aBarycentric;
out vec3 vPosition;
out vec3 vNormal;
out float vCurvature;
out vec3 vSignedMeanCurvature;
out vec3 vAltitude;
out vec3 vBarycentric;
flat out vec3 vEdgeAngles;
flat out int vId;
flat out int vTriangleId;
void main(){
 vPosition=position;
 vNormal=normalize(normal);
 vCurvature=aCurvature;
 vSignedMeanCurvature=aSignedMeanCurvature;
 vId=int(aId+.5);
 vTriangleId=int(aTriangleId+.5);
 vEdgeAngles=aEdgeAngles;
 vAltitude=aEdgeAltitude;
 vBarycentric=aBarycentric;
 // Expand each UV triangle at its raster boundary in pixel space. A plain
 // raster misses skinny tips and leaves isolated black holes near vertices.
 // The shared material UVs remain unchanged; this affects only mesh bakes.
 vec2 uvDirection=(uv-aUvCentroid)/max(length(uv-aUvCentroid),1.e-8);
 vec2 coveredUV=uv+uUVTexel*uvDirection*.72;
 gl_Position=vec4(coveredUV*2.-1.,0.,1.);
}
