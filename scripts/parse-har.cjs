const fs = require('fs');
const har = JSON.parse(fs.readFileSync('C:/Users/Irfan/Downloads/developer.grab.com.har', 'utf8'));
const entries = har.log.entries;
const apiCalls = entries.filter(e => e.request.url.indexOf('validate-menu') > -1);
apiCalls.forEach((e, i) => {
  console.log('--- Entry ' + i + ' ---');
  console.log('Method:', e.request.method);
  console.log('URL:', e.request.url);
  console.log('Request body:', e.request.postData ? e.request.postData.text.substring(0, 5000) : 'none');
  console.log('Response body:', e.response.content.text ? e.response.content.text.substring(0, 500) : 'none');
  console.log('Status:', e.response.status);
});
