import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jakartaPasswordForNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return 'carli' + value('day') + value('month') + value('year') + value('hour')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Konfigurasi Supabase Function belum lengkap.')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ ok: false, error: 'Silakan login ulang ke CarrClerek.' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser(token)
    if (authError || !user) return json({ ok: false, error: 'Sesi login tidak valid.' }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, is_active, expires_at, store_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) throw new Error(profileError.message)
    if (!profile || !profile.store_id) {
      return json({ ok: false, error: 'Profil atau toko akun tidak ditemukan.' }, 403)
    }
    if (profile.is_active === false) {
      return json({ ok: false, error: 'Akun CarrClerek tidak aktif.' }, 403)
    }
    if (profile.expires_at && new Date(profile.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: 'Masa aktif akun CarrClerek sudah habis.' }, 403)
    }

    const { count, error: countError } = await admin
      .from('stock_opname_access_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('success', false)
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    if (countError) throw new Error('Pemeriksaan batas percobaan gagal: ' + countError.message)
    if ((count || 0) >= 5) {
      return json({ ok: false, error: 'Terlalu banyak percobaan. Coba lagi 15 menit kemudian.' }, 429)
    }

    const body = await req.json().catch(() => ({}))
    const supplied = String(body.password || '')
    const valid = supplied === jakartaPasswordForNow()

    const { error: logError } = await admin.from('stock_opname_access_attempts').insert({
      user_id: user.id,
      store_id: profile.store_id,
      success: valid,
    })
    if (logError) throw new Error('Pencatatan verifikasi gagal: ' + logError.message)

    if (!valid) return json({ ok: false, error: 'Password Stock Opname salah atau sudah berganti jam.' }, 401)

    return json({ ok: true, message: 'Verifikasi berhasil.' })
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400)
  }
})
