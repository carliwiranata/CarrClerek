import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Sesi admin tidak ditemukan.')

    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) throw new Error('Token login admin tidak ditemukan.')

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user: caller }, error: callerError } =
      await userClient.auth.getUser(accessToken)
    if (callerError || !caller) throw new Error('Sesi login tidak valid.')

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: adminProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, is_active, expires_at')
      .eq('id', caller.id)
      .maybeSingle()

    if (profileError) throw new Error(profileError.message)
    if (!adminProfile || String(adminProfile.role || '').toLowerCase() !== 'admin') {
      throw new Error('Hanya admin yang boleh membuat user.')
    }
    if (adminProfile.is_active === false) throw new Error('Akun admin tidak aktif.')
    if (adminProfile.expires_at && new Date(adminProfile.expires_at) < new Date()) {
      throw new Error('Masa aktif admin sudah habis.')
    }

    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const username = String(body.username || '').trim()
    const fullName = String(body.full_name || '').trim()
    const days = Math.max(1, Math.min(3650, Number(body.days) || 30))

    if (!email || !password) throw new Error('Email dan password wajib diisi.')
    if (password.length < 6) throw new Error('Password minimal 6 karakter.')

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: username || email.split('@')[0],
        full_name: fullName || username || email,
        role: 'user',
      },
    })

    if (createError) throw new Error(createError.message)
    const uid = created.user?.id
    if (!uid) throw new Error('ID user tidak berhasil dibuat.')

    const expires = new Date(Date.now() + days * 86400000).toISOString()
    const { error: insertError } = await adminClient.from('profiles').upsert({
      id: uid,
      username: username || email.split('@')[0],
      full_name: fullName || username || email,
      role: 'user',
      is_active: true,
      expires_at: expires,
    }, { onConflict: 'id' })

    if (insertError) {
      await adminClient.auth.admin.deleteUser(uid)
      throw new Error('Akun dibuat tetapi profil gagal disimpan: ' + insertError.message)
    }

    return new Response(JSON.stringify({
      ok: true,
      user_id: uid,
      expires_at: expires,
      message: 'User berhasil ditambahkan.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
