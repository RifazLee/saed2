export function notFound(_req,res) { res.status(404).json({success:false,message:'Endpoint not found'}); }
export function errorHandler(err,_req,res,_next) {
  console.error(err);
  const status=Number(err.status)||500;
  res.status(status).json({success:false,message:status===500?'Internal server error':err.message});
}
export function httpError(message,status=400){const e=new Error(message);e.status=status;return e;}
