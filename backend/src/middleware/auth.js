import jwt from 'jsonwebtoken';
export function requireAuth(req,res,next) {
  const header=req.headers.authorization || '';
  const token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token) return res.status(401).json({success:false,message:'Authentication required'});
  try { req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({success:false,message:'Invalid or expired token'}); }
}
export function optionalAuth(req,_res,next) {
  const header=req.headers.authorization || '';
  if(header.startsWith('Bearer ')) { try { req.user=jwt.verify(header.slice(7),process.env.JWT_SECRET); } catch {} }
  next();
}
