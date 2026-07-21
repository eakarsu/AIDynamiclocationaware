function validateRuntime(env=process.env){
  const errors=[];
  if(!env.JWT_SECRET||env.JWT_SECRET.length<32)errors.push('JWT_SECRET must contain at least 32 characters');
  if(!env.LOCATION_SUBJECT_HMAC_SECRET||env.LOCATION_SUBJECT_HMAC_SECRET.length<32)errors.push('LOCATION_SUBJECT_HMAC_SECRET must contain at least 32 characters');
  for(const key of ['DB_NAME','DB_USER','DB_PASSWORD'])if(!env[key])errors.push(`${key} is required`);
  if(env.NODE_ENV==='production'&&env.ENABLE_LEGACY_AD_SURFACES==='true')errors.push('Legacy ad surfaces cannot be enabled in production');
  if(env.NODE_ENV==='production'&&(env.CORS_ORIGINS||'').includes('*'))errors.push('Wildcard CORS is forbidden in production');
  if(errors.length)throw new Error(`Invalid runtime configuration: ${errors.join('; ')}`);
}
module.exports={validateRuntime};

