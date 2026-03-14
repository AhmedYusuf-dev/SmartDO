export default async function handler(req, res) {
  // Add CORS headers for local development if needed, though Vercel handles it via vercel.json usually
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user } = req.body;
  const apiKey = process.env.VITE_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY;
  const baseId = process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return res.status(500).json({ error: 'Airtable credentials not configured on server' });
  }

  try {
    const url = `https://api.airtable.com/v0/${baseId}/Users`;
    
    // Check if user already exists
    const checkRes = await fetch(`${url}?filterByFormula={Email}='${encodeURIComponent(user.email)}'`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    if (!checkRes.ok) throw new Error('Failed to check Airtable');
    const checkData = await checkRes.json();
    
    if (checkData.records && checkData.records.length > 0) {
      return res.status(200).json({ message: 'User already exists' });
    }

    // Create user in Airtable
    const createRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [{
          fields: {
            'ID': user.id,
            'Name': user.name,
            'Email': user.email,
            'Avatar URL': user.avatarUrl || ''
          }
        }]
      })
    });

    if (!createRes.ok) throw new Error('Failed to save to Airtable');
    
    return res.status(200).json({ message: 'Successfully saved user to Airtable' });
  } catch (err) {
    console.error('Airtable sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
