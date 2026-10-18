import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import axios from 'axios';
import {getTableName} from 'drizzle-orm';
import {createServer} from '@atproto/xrpc-server';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='song-match-test';
const Match=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.MatchSong/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');const {loadLexicons}=await import('../output/Rocksky.Lexicon/index.js');const run=aff=>fromAff(aff)();
const params={title:'Roygbiv',artist:'Boards of Canada',album:'Music Has the Right to Children',isrc:'GBBPW9800019'};
const candidate={source:'spotify',id:'2XQSgmtEY2titXhfY414dy',title:params.title,artists:[params.artist],album:params.album,identifiers:{isrc:params.isrc,spotifyTrackId:'2XQSgmtEY2titXhfY414dy'},durationMs:151000,trackNumber:9,discNumber:1};
function context(status='matched',track=candidate,candidates=[candidate],records={}){
 const queries=[],requests=[];const ctx={matching:axios.create({adapter:async config=>{requests.push(JSON.parse(config.data));return {data:{policyVersion:'1',status,track,candidates:candidates.map(track=>({track}))},status:200,statusText:'OK',headers:{},config}}}),readDb:{select(){let table;const q={from(t){table=getTableName(t);queries.push(table);return q},where(){return q},limit(){return q},async execute(){return records[table]??[]}};return q}},redis:{get(){throw Error('legacy cache forbidden')}}};return {ctx,queries,requests};
}
{
 const m=context();const result=await run(Match.retrieveMatch(m.ctx)(params));assert.equal(result.duration,151000);assert.equal(result.isrc,params.isrc);assert.equal(result.trackNumber,9);assert.equal(result.playCount,0);assert.equal(result.uniqueListeners,0);assert.equal(result.spotifyLink,'https://open.spotify.com/track/'+candidate.id);assert.equal(result.mbId,null);assert.equal(result.mbArtists,null);assert.equal(result.matches[0].providerId,candidate.id);assert.deepEqual(m.requests[0].identifiers,{isrc:params.isrc});
}
{
 const m=context('ambiguous',null,[candidate,{...candidate,identifiers:{isrc:'OTHER'}}]);const result=await run(Match.retrieveMatch(m.ctx)(params));assert.equal(result.isrc,params.isrc);assert.deepEqual(result.matches.map(c=>c.isrc),[params.isrc,'OTHER']);assert.equal(result.status,undefined);
}
{
 const m=context('unmatched',null,[]);assert.deepEqual(await run(Match.retrieveMatch(m.ctx)(params)),{matches:[]});assert.equal(m.queries.length,0);
}
{
 const deezer={...candidate,source:'deezer',id:'12345',identifiers:{deezerTrackId:'12345',isrc:params.isrc},providerScore:86.6,providerRank:307167,providerLink:'https://deezer.test/original',preview:'https://preview.test/original'};
 const mb={...candidate,source:'musicbrainz',id:'mb-id',identifiers:{musicbrainzRecordingId:'mb-id'},musicbrainzArtists:[{mbid:'artist-id',name:params.artist}]};
 const m=context('matched',candidate,[candidate,deezer,mb,{...candidate,source:'catalog'}]);const result=await run(Match.retrieveMatch(m.ctx)(params));assert.equal(result.matches.length,3);assert.equal(result.matches[1].id,12345);assert.equal(result.matches[1].score,87);assert.equal(result.matches[1].rank,307167);assert.equal(result.matches[1].link,deezer.providerLink);assert.equal(result.matches[1].preview,deezer.preview);assert.equal(result.matches[2].link,'https://musicbrainz.org/recording/mb-id');assert.equal(result.matches[2].id,undefined);assert.deepEqual(result.matches[2].mbArtists,mb.musicbrainzArtists);
 for(const id of ['0','-1','1.5','9007199254740992','bad'])assert.equal((await run(Match.candidateMatch({...deezer,id,identifiers:{}}))).id,undefined);
}
{
 const record={id:'catalog-id',title:candidate.title,artist:params.artist,album:params.album,albumArtist:params.artist,isrc:params.isrc,duration:1,lyrics:'Stored lyrics',label:'Stored label',mbId:'catalog-mbid',spotifyLink:null,albumArt:'catalog-art',genre:'Electronic, Ambient',createdAt:new Date('2020-01-01'),sha256:'hash',uri:'song-uri',albumUri:'album-uri',artistUri:'artist-uri'};
 const m=context('matched',candidate,[candidate],{tracks:[record],user_tracks:[{count:2}],scrobbles:[{count:7}]});const result=await run(Match.retrieveMatch(m.ctx)(params));assert.equal(result.id,'catalog-id');assert.equal(result.duration,151000);assert.equal(result.lyrics,'Stored lyrics');assert.equal(result.label,'Stored label');assert.equal(result.mbId,'catalog-mbid');assert.equal(result.spotifyLink,'https://open.spotify.com/track/'+candidate.id);assert.deepEqual(result.genres,['Electronic','Ambient']);assert.equal(result.createdAt,'2020-01-01T00:00:00.000Z');assert.equal(result.playCount,7);assert.equal(result.uniqueListeners,2);assert.equal(result.albumUri,'album-uri');
}
{
 const selected={...candidate,source:'catalog',album:'Compilation',albumArtist:'Various Artists',releaseDate:'2001-02-03',genres:['provider']};
 const record={id:'catalog-id',title:'Original',artist:'Original',album:'Original',albumArtist:'Original',duration:100,genre:'',uri:'song-uri',albumUri:'wrong-album',artistUri:'wrong-artist',sha256:'hash'};
 const m=context('matched',selected,[selected],{tracks:[record],albums:[{title:'Compilation',artist:'Various Artists',uri:'compilation-uri',albumArt:'release-art',releaseDate:'2000-01-01',year:2000}],artists:[{name:'Various Artists',uri:'artist-uri',picture:'picture',genres:['catalog']}]});
 const result=await run(Match.retrieveMatch(m.ctx)(params));assert.equal(result.title,candidate.title);assert.equal(result.artist,params.artist);assert.equal(result.album,'Compilation');assert.equal(result.albumArtist,'Various Artists');assert.equal(result.albumUri,'compilation-uri');assert.equal(result.artistUri,'artist-uri');assert.equal(result.albumArt,'release-art');assert.equal(result.releaseDate,'2000-01-01');assert.equal(result.year,2000);assert.equal(result.artistPicture,'picture');assert.deepEqual(result.genres,['provider']);assert.deepEqual(result.matches,[]);
}
{
 const m=context();m.ctx.matching=axios.create({adapter:async()=>{throw Error('HTTP 503')}});await assert.rejects(run(Match.retrieveMatch(m.ctx)(params)),/HTTP 503/);assert.equal(m.queries.length,0);
}
{
 const m=context('ambiguous',null,[candidate]);const server=createServer(await run(loadLexicons));let handler;server.method=(_,config)=>{handler=config.handler;return server};Match.register(server)(m.ctx)();const response=await handler({params});assert.equal(response.encoding,'application/json');assert.equal(JSON.parse(JSON.stringify(response.body)).title,params.title);
}
console.log('Song matching service selection, candidate order, provider fields, catalog metadata precedence and joined releases checks passed');
