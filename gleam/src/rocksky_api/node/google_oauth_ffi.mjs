import {google} from 'googleapis';
export const authorizeUrl=(id,secret,redirect,state)=>new google.auth.OAuth2(id,secret,redirect).generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive'],state});
