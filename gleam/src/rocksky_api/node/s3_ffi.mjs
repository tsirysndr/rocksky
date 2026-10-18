import {S3Client,HeadBucketCommand,DeleteObjectCommand,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Ok,Error as GError,BitArray} from '../../gleam.mjs';
import {Some,None} from '../../../gleam_stdlib/gleam/option.mjs';
const wrap=(p,f=x=>x)=>Promise.resolve(p).then(v=>new Ok(f(v)),e=>new GError(e));
export const client=(region,endpoint,accessKeyId,secretAccessKey)=>new S3Client({region,endpoint,credentials:{accessKeyId,secretAccessKey}});
export const headBucket=(c,Bucket)=>wrap(c.send(new HeadBucketCommand({Bucket})),()=>undefined);
export const deleteObject=(c,Bucket,Key)=>wrap(c.send(new DeleteObjectCommand({Bucket,Key})),()=>undefined);
export const putObject=(c,Bucket,Key,body,ContentType)=>wrap(c.send(new PutObjectCommand({Bucket,Key,Body:new Uint8Array(body.rawBuffer??body.buffer),ContentType})),()=>undefined);
export const getObject=(c,Bucket,Key)=>wrap(c.send(new GetObjectCommand({Bucket,Key})).then(async r=>new BitArray(await r.Body.transformToByteArray())));
export const presignGet=(c,Bucket,Key,expiresIn,disposition)=>wrap(getSignedUrl(c,new GetObjectCommand({Bucket,Key,...(disposition instanceof Some?{ResponseContentDisposition:disposition[0]}:{})}),{expiresIn}));

const option=value=>value==null?new None():new Some(value);
export const getStream=(c,Bucket,Key,range)=>wrap(c.send(new GetObjectCommand({Bucket,Key,...(range instanceof Some?{Range:range[0]}:{})})),r=>({body:option(r.Body?.transformToWebStream()),content_type:option(r.ContentType),content_length:option(r.ContentLength),content_range:option(r.ContentRange)}));
export const putObjectMetadata=(c,Bucket,Key,body,ContentType,metadata)=>{const Body=Buffer.from(body.rawBuffer);return wrap(c.send(new PutObjectCommand({Bucket,Key,Body,ContentType,ContentLength:Body.length,Metadata:Object.fromEntries(metadata)})),()=>undefined);};
export const getObjectTimeout=async(c,Bucket,Key,timeoutMs)=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const r=await c.send(new GetObjectCommand({Bucket,Key}),{abortSignal:controller.signal});return new Ok(new BitArray(await r.Body.transformToByteArray()));}catch(e){return new GError(e);}finally{clearTimeout(timer);}};
