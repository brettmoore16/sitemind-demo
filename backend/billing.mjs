import { assert } from './errors.mjs';
export async function checkout({env,userId,tenantId,customerId,fetcher=fetch}) {
  assert(env.BILLING_ENABLED==='true',503,'Billing is disabled. No payment information is being collected.');
  // This phase cannot use live Stripe keys, even if a flag is set accidentally.
  assert(env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && env.STRIPE_PRICE_ID,503,'Only explicitly configured Stripe test mode is supported');
  const fields={'mode':'subscription','payment_method_collection':'always','line_items[0][price]':env.STRIPE_PRICE_ID,'line_items[0][quantity]':'1','subscription_data[trial_period_days]':'14','subscription_data[trial_settings][end_behavior][missing_payment_method]':'cancel','subscription_data[metadata][tenant_id]':tenantId,'metadata[tenant_id]':tenantId,'metadata[user_id]':userId,'client_reference_id':tenantId,'success_url':env.APP_ORIGIN+'/?billing=returned','cancel_url':env.APP_ORIGIN+'/?billing=cancelled'};
  if(customerId)fields.customer=customerId;
  const response=await fetcher('https://api.stripe.com/v1/checkout/sessions',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`${tenantId}:initial-trial`},body:new URLSearchParams(fields)});
  assert(response.ok,502,'The billing provider could not start checkout');
  const result=await response.json();
  assert(typeof result.url==='string' && new URL(result.url).origin==='https://checkout.stripe.com',502,'Invalid checkout response');
  return {url:result.url};
}
export function day13Reminder(subscription,now=new Date()) {
  if(subscription.status!=='trialing' || !subscription.trial_start || !subscription.trial_end)return null;
  const start=new Date(subscription.trial_start), end=new Date(subscription.trial_end);
  if(now-start<12*86400000 || now>=end)return null;
  // Day 13 begins after 12 full trial days. The outbox key enforces one reminder.
  return {key:`trial-day13:${subscription.stripe_subscription_id}`,tenantId:subscription.tenant_id,message:'Your SiteMind trial ends soon. Review billing settings before your trial ends.'};
}
export async function canonicalStripeEvent(event,env,fetcher=fetch) {
  const supported=['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'];
  if(!supported.includes(event.type))return event;
  const object=event.data.object;
  const id=event.type==='checkout.session.completed'?object.subscription:object.id;
  assert(typeof id==='string' && /^sub_[a-zA-Z0-9]+$/.test(id),400,'Invalid subscription identifier');
  const response=await fetcher(`https://api.stripe.com/v1/subscriptions/${id}`,{signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
  assert(response.ok,502,'Subscription verification failed. The webhook can be retried.');
  const subscription=await response.json();
  assert(subscription.id===id && subscription.livemode===false && typeof subscription.metadata?.tenant_id==='string',400,'Invalid test subscription');
  // Fetch the current provider state so delayed/out-of-order webhooks cannot revive
  // an already cancelled subscription. Never grant access from a checkout redirect.
  return {...event,sitemind_subscription:subscription};
}
