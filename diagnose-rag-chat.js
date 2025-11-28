/**
 * RAG Chat Diagnostics Script
 * Run this in browser console to check all potential issues
 */

console.log('🔍 Starting RAG Chat Diagnostics...\n');

// 1. Check Authentication
console.log('1️⃣ Checking Authentication...');
const authData = Object.keys(localStorage)
  .filter(k => k.includes('supabase'))
  .map(k => {
    try {
      const data = JSON.parse(localStorage.getItem(k));
      if (data.access_token || data.user) {
        return { key: k, hasToken: !!data.access_token, hasUser: !!data.user, userId: data.user?.id };
      }
    } catch (e) {}
    return null;
  })
  .filter(Boolean);

if (authData.length > 0) {
  console.log('✅ Auth data found:', authData);
} else {
  console.error('❌ No auth data found. Please log in first!');
}

// 2. Check API Key
console.log('\n2️⃣ Checking API Key...');
const lovableApiKey = localStorage.getItem('lovable_ai_api_key');
if (lovableApiKey) {
  console.log('✅ Lovable API key found:', lovableApiKey.substring(0, 10) + '...');
} else {
  console.warn('⚠️ No Lovable API key found. You need to either:');
  console.warn('  - Add it in Chatbot settings, OR');
  console.warn('  - Set LOVABLE_API_KEY in Supabase Edge Function environment');
}

// 3. Test Supabase Connection
console.log('\n3️⃣ Testing Supabase Connection...');
const supabaseUrl = 'https://cysokmjkkmitxzagoqjh.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5c29rbWpra21pdHh6YWdvcWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5OTAwMTIsImV4cCI6MjA3NDU2NjAxMn0.ZwXun6HYJ8HtjF-r0JBv5lCZoTPwMGAyZv01jZzP8Gs';

fetch(`${supabaseUrl}/rest/v1/`, {
  headers: { 'apikey': anonKey }
})
  .then(res => {
    if (res.ok) {
      console.log('✅ Supabase REST API is accessible');
    } else {
      console.error('❌ Supabase REST API error:', res.status, res.statusText);
    }
  })
  .catch(err => console.error('❌ Cannot reach Supabase:', err));

// 4. Test Edge Function
console.log('\n4️⃣ Testing RAG Chat Edge Function...');
const testAuth = authData[0];
if (testAuth) {
  const authKey = Object.keys(localStorage).find(k => k.includes('supabase'));
  const auth = JSON.parse(localStorage.getItem(authKey));
  const accessToken = auth.access_token;
  const userId = auth.user?.id;

  if (accessToken && userId) {
    console.log('Calling rag-chat function...');
    
    fetch(`${supabaseUrl}/functions/v1/rag-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey
      },
      body: JSON.stringify({
        query: 'Test query',
        model: 'google/gemini-2.5-flash',
        userId: userId,
        apiKey: lovableApiKey || undefined
      })
    })
    .then(async (res) => {
      const text = await res.text();
      console.log(`Response Status: ${res.status} ${res.statusText}`);
      
      try {
        const json = JSON.parse(text);
        if (res.ok) {
          console.log('✅ RAG Chat function works!');
          console.log('Answer:', json.answer);
          console.log('Sources:', json.sources);
        } else {
          console.error('❌ RAG Chat function error:', json);
          
          // Provide specific guidance based on error
          if (json.error?.includes('API key')) {
            console.error('\n📝 FIX: Add Lovable API key in Settings or add LOVABLE_API_KEY to Supabase environment');
          } else if (json.error?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
            console.error('\n📝 FIX: Add SUPABASE_SERVICE_ROLE_KEY to Supabase Edge Function environment');
          } else if (json.error?.includes('Database')) {
            console.error('\n📝 FIX: Check database connection and RLS policies');
          }
        }
      } catch (e) {
        console.error('❌ Cannot parse response:', text);
      }
    })
    .catch(err => {
      console.error('❌ Network error calling rag-chat:', err);
    });
  }
}

// 5. Check Documents
console.log('\n5️⃣ Checking User Documents...');
if (testAuth) {
  const authKey = Object.keys(localStorage).find(k => k.includes('supabase'));
  const auth = JSON.parse(localStorage.getItem(authKey));
  const accessToken = auth.access_token;
  
  fetch(`${supabaseUrl}/rest/v1/documents?select=id,title&limit=5`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey
    }
  })
  .then(async (res) => {
    if (res.ok) {
      const docs = await res.json();
      console.log(`✅ Found ${docs.length} documents`);
      if (docs.length > 0) {
        console.log('Sample documents:', docs.map(d => d.title));
      } else {
        console.warn('⚠️ No documents found. Upload some documents first!');
      }
    } else {
      console.error('❌ Cannot fetch documents:', res.status);
    }
  })
  .catch(err => console.error('❌ Error fetching documents:', err));
}

console.log('\n✅ Diagnostics complete! Check the results above.\n');
console.log('📚 For detailed guide, see: FIX-RAG-CHAT-500.md');
console.log('🧪 For interactive testing, open: test-rag-chat.html');
