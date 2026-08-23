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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) throw new Error('Sesi admin tidak ditemukan.')

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
      throw new Error('Hanya admin yang boleh mengelola user.')
    }
    if (adminProfile.is_active === false) throw new Error('Akun admin tidak aktif.')
    if (adminProfile.expires_at && new Date(adminProfile.expires_at) < new Date()) {
      throw new Error('Masa aktif admin sudah habis.')
    }

    const body = await req.json()
    const action = String(body.action || '').trim().toLowerCase()
    const userId = String(body.user_id || '').trim()
    if (!userId) throw new Error('ID user tidak ditemukan.')

    if (userId === caller.id) throw new Error('Admin tidak boleh menghapus atau mengubah akun admin sendiri dari sini.')

    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('id, username, full_name, role, is_active, expires_at')
      .eq('id', userId)
      .maybeSingle()

    if (targetError) throw new Error(targetError.message)
    if (!targetProfile) throw new Error('Profil user tidak ditemukan.')
    if (String(targetProfile.role || 'user').toLowerCase() === 'admin') {
      throw new Error('Akun admin tidak dapat dikelola dari daftar user.')
    }


    if (action === 'toggle') {
      const desiredActive = body.is_active === true || body.is_active === 'true'
      const { data: currentAuth, error: currentAuthError } =
        await adminClient.auth.admin.getUserById(userId)
      if (currentAuthError || !currentAuth?.user) {
        throw new Error(currentAuthError?.message || 'Akun Auth user tidak ditemukan.')
      }

      const currentMetadata = { ...(currentAuth.user.user_metadata || {}) }
      const nowMs = Date.now()
      const currentExpiryMs = targetProfile.expires_at
        ? new Date(targetProfile.expires_at).getTime()
        : NaN

      if (!desiredActive) {
        if (targetProfile.is_active === false) {
          return json({ ok: true, message: 'User sudah nonaktif.' })
        }

        const remainingMs = Number.isFinite(currentExpiryMs)
          ? Math.max(0, currentExpiryMs - nowMs)
          : null

        const metadata = {
          ...currentMetadata,
          cashviewer_paused: true,
          cashviewer_paused_remaining_ms: remainingMs,
          cashviewer_paused_at: new Date(nowMs).toISOString(),
        }

        const { error: authPauseError } =
          await adminClient.auth.admin.updateUserById(userId, {
            user_metadata: metadata,
          })
        if (authPauseError) throw new Error(authPauseError.message)

        const { error: pauseError } = await adminClient
          .from('profiles')
          .update({ is_active: false })
          .eq('id', userId)
        if (pauseError) throw new Error(pauseError.message)

        return json({
          ok: true,
          message: 'User dinonaktifkan. Masa aktif dijeda.',
          paused_remaining_ms: remainingMs,
        })
      }

      if (targetProfile.is_active !== false) {
        return json({ ok: true, message: 'User sudah aktif.' })
      }

      const paused = currentMetadata.cashviewer_paused === true
      const pausedRemaining = Number(currentMetadata.cashviewer_paused_remaining_ms)
      let resumeExpiry = targetProfile.expires_at || null

      if (paused && Number.isFinite(pausedRemaining)) {
        if (pausedRemaining <= 0) {
          throw new Error('Masa aktif user sudah habis sebelum akun dinonaktifkan.')
        }
        resumeExpiry = new Date(nowMs + pausedRemaining).toISOString()
      } else if (paused && currentMetadata.cashviewer_paused_remaining_ms === null) {
        resumeExpiry = null
      }

      const metadata = { ...currentMetadata }
      delete metadata.cashviewer_paused
      delete metadata.cashviewer_paused_remaining_ms
      delete metadata.cashviewer_paused_at

      const { error: authResumeError } =
        await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: metadata,
        })
      if (authResumeError) throw new Error(authResumeError.message)

      const { error: resumeError } = await adminClient
        .from('profiles')
        .update({ is_active: true, expires_at: resumeExpiry })
        .eq('id', userId)
      if (resumeError) throw new Error(resumeError.message)

      return json({
        ok: true,
        message: 'User diaktifkan kembali. Sisa masa aktif dilanjutkan.',
        expires_at: resumeExpiry,
        paused_remaining_ms: paused ? pausedRemaining : null,
      })
    }

    if (action === 'get') {
      const { data: authUser, error: getError } = await adminClient.auth.admin.getUserById(userId)
      if (getError || !authUser?.user) throw new Error(getError?.message || 'Akun Auth user tidak ditemukan.')

      return json({
        ok: true,
        user: {
          id: userId,
          email: authUser.user.email || '',
          username: targetProfile.username || '',
          full_name: targetProfile.full_name || '',
          is_active: targetProfile.is_active !== false,
          expires_at: targetProfile.expires_at || null,
        },
      })
    }

    if (action === 'update') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const username = String(body.username ?? '').trim()
      const fullName = String(body.full_name ?? '').trim()
      const password = String(body.password ?? '')
      const expiresAtRaw = String(body.expires_at ?? '').trim()
      const isActive = body.is_active === undefined
        ? targetProfile.is_active !== false
        : Boolean(body.is_active)

      if (!email) throw new Error('Email wajib diisi.')
      if (password && password.length < 6) throw new Error('Password minimal 6 karakter.')

      let requestedExpiresAt: string | null = null
      if (expiresAtRaw) {
        const d = new Date(expiresAtRaw)
        if (Number.isNaN(d.getTime())) throw new Error('Tanggal masa aktif tidak valid.')
        d.setHours(23, 59, 59, 999)
        requestedExpiresAt = d.toISOString()
      }

      const { data: currentAuth, error: currentAuthError } =
        await adminClient.auth.admin.getUserById(userId)
      if (currentAuthError || !currentAuth?.user) {
        throw new Error(currentAuthError?.message || 'Akun Auth user tidak ditemukan.')
      }

      const currentMetadata = { ...(currentAuth.user.user_metadata || {}) }
      const nowMs = Date.now()
      const wasActive = targetProfile.is_active !== false
      const paused = currentMetadata.cashviewer_paused === true
      const pausedRemaining = Number(currentMetadata.cashviewer_paused_remaining_ms)

      const targetDateKey = targetProfile.expires_at
        ? new Date(targetProfile.expires_at).toISOString().slice(0, 10)
        : ''
      const requestedDateKey = requestedExpiresAt
        ? new Date(requestedExpiresAt).toISOString().slice(0, 10)
        : ''

      let expiresAt = requestedExpiresAt

      // Jika user sedang dijeda lalu admin mengaktifkannya kembali dari form Edit,
      // lanjutkan dari sisa waktu yang tersimpan, kecuali admin benar-benar
      // mengganti tanggal masa aktif.
      if (!wasActive && isActive && paused && Number.isFinite(pausedRemaining)) {
        const expiryChanged = requestedDateKey !== targetDateKey
        if (!expiryChanged) {
          if (pausedRemaining <= 0) {
            throw new Error('Masa aktif user sudah habis sebelum akun diaktifkan kembali.')
          }
          expiresAt = new Date(nowMs + pausedRemaining).toISOString()
        }
      }

      // Jika admin mengubah tanggal saat user tetap nonaktif, hitung ulang
      // sisa waktu yang dijeda berdasarkan tanggal baru.
      if (!isActive) {
        const pauseBase = requestedExpiresAt
          ? new Date(requestedExpiresAt).getTime()
          : (targetProfile.expires_at ? new Date(targetProfile.expires_at).getTime() : NaN)

        currentMetadata.cashviewer_paused = true
        currentMetadata.cashviewer_paused_at =
          currentMetadata.cashviewer_paused_at || new Date(nowMs).toISOString()
        currentMetadata.cashviewer_paused_remaining_ms =
          Number.isFinite(pauseBase) ? Math.max(0, pauseBase - nowMs) : null

        // Tetap simpan tanggal yang dipilih admin agar saat resume bisa
        // dilanjutkan dari sisa waktu yang dijeda.
        expiresAt = requestedExpiresAt
      } else {
        delete currentMetadata.cashviewer_paused
        delete currentMetadata.cashviewer_paused_remaining_ms
        delete currentMetadata.cashviewer_paused_at
      }

      const authUpdate: Record<string, unknown> = {
        email,
        email_confirm: true,
        user_metadata: {
          ...currentMetadata,
          username: username || email.split('@')[0],
          full_name: fullName || username || email,
          role: 'user',
        },
      }
      if (password) authUpdate.password = password

      const { error: authError } =
        await adminClient.auth.admin.updateUserById(userId, authUpdate)
      if (authError) throw new Error(authError.message)

      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          username: username || email.split('@')[0],
          full_name: fullName || username || email,
          is_active: isActive,
          expires_at: expiresAt,
        })
        .eq('id', userId)

      if (updateError) {
        throw new Error('Auth berhasil diperbarui, tetapi profil gagal disimpan: ' + updateError.message)
      }

      return json({
        ok: true,
        message: isActive
          ? (wasActive ? 'User berhasil diperbarui.' : 'User diaktifkan kembali. Sisa masa aktif dilanjutkan.')
          : 'User diperbarui dan masa aktif dijeda.',
        expires_at: expiresAt,
      })
    }

    if (action === 'delete') {
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (authDeleteError) throw new Error(authDeleteError.message)

      // Bersihkan profil juga. Pada schema dengan ON DELETE CASCADE, baris ini
      // tidak masalah karena hasilnya hanya 0 baris.
      const { error: profileDeleteError } = await adminClient
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (profileDeleteError) {
        throw new Error('Akun Auth sudah dihapus, tetapi profil gagal dibersihkan: ' + profileDeleteError.message)
      }

      return json({ ok: true, message: 'User berhasil dihapus.' })
    }

    throw new Error('Aksi tidak dikenal.')
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400)
  }
})
