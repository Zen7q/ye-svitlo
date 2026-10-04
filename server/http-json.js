export async function readJson(req,limit){
 let text='';
 if(req.body!==undefined)text=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);
 else for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>limit){const error=Error('Запит завеликий.');error.status=413;throw error;}}
 if(Buffer.byteLength(text)>limit){const error=Error('Запит завеликий.');error.status=413;throw error;}
 return JSON.parse(text);
}
