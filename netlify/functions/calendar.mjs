import {getStore} from '@netlify/blobs';
import {handleCalendar} from '../../server/calendar.mjs';

export const config={path:['/api/calendar','/api/login','/api/logout','/api/session','/api/estimate','/api/request','/api/owner','/api/pricing','/api/decision']};

export default async function handler(request,context){
  try{
    const store=getStore({name:'big-blue-heaven-calendar',consistency:'strong'});
    return await handleCalendar(request,store,process.env.CALENDAR_ADMIN_PASSWORD,context.ip);
  }catch{
    return Response.json({error:'The calendar service is temporarily unavailable. Please try again.'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
