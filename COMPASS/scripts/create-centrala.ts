// @ts-nocheck
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

async function createCentralaUser() {
  const email = 'centrala@b2bnetwork.pl'
  const password = 'Password123!'
  const fullName = 'Ewa Nowak'
  const role = 'centrala'

  console.log(`Checking if user ${email} exists...`)

  // Create auth user using admin API
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: role
    }
  })

  if (createError) {
    if (createError.message.includes('already registered')) {
      console.log('User already exists. Updating profile...')
      // We need to find the user ID to update the profile
      const { data: users, error: getError } = await supabaseAdmin.auth.admin.listUsers()
      if (getError) {
        console.error('Error listing users:', getError)
        return
      }
      
      const user = users.users.find(u => u.email === email)
      if (user) {
        await updateProfile(user.id, fullName, role)
      } else {
        console.error('Could not find existing user.')
      }
    } else {
      console.error('Error creating user:', createError)
    }
    return
  }

  console.log('Created auth user:', newUser.user.id)
  await updateProfile(newUser.user.id, fullName, role)
  console.log('\nSUCCESS! You can login with:')
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}`)
}

async function updateProfile(userId, fullName, role) {
  console.log(`Updating profile for ${userId} to role: ${role}...`)
  
  // Try to update existing profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      full_name: fullName,
      role: role,
      onboarding_completed: true
    })

  if (profileError) {
    console.error('Error updating profile:', profileError)
  } else {
    console.log('Profile updated successfully.')
  }
}

createCentralaUser()
