import {Router} from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {pool} from '../config/db.js';
import {httpError} from '../middleware/errors.js';
const router=Router();
router.post('/login',async(req,res,next)=>{
 try{
  const {email,password}=req.body||{};
  if(!email||!password)throw httpError('Email and password are required');
  const [rows]=await pool.execute('SELECT id,email,password_hash,role FROM operators WHERE email=? AND is_active=1 LIMIT 1',[email]);
  if(!rows.length||!(await bcrypt.compare(password,rows[0].password_hash)))throw httpError('Invalid credentials',401);
  const user=rows[0],token=jwt.sign({sub:user.id,email:user.email,role:user.role},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'8h'});
  res.json({success:true,token,user:{id:user.id,email:user.email,role:user.role}});
 }catch(e){next(e);}
});
export default router;
