// Informa ao painel se este deploy é uma prévia da Vercel (branch ainda não aprovada).
// Nas prévias o painel abre sem login e não grava nada no banco real.
module.exports=(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.statusCode=200;
 res.end(JSON.stringify({preview:process.env.VERCEL_ENV==='preview'}));
};
