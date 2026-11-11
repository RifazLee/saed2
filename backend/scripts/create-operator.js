import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {pool} from '../src/config/db.js';
const [email,password,role='operator']=process.argv.slice(2);
if(!email||!password||password.length<12||!['operator','admin'].includes(role)){
 console.error("Usage: node scripts/create-operator.js email 'password-min-12-chars' [operator|admin]");process.exit(1);
}
try{
 const hash=await bcrypt.hash(password,12);
 await pool.execute('INSERT INTO operators(id,email,password_hash,role) VALUES(?,?,?,?)',[randomUUID(),email,hash,role]);
 console.log(`Created ${role}: ${email}`);
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await pool.end();}
