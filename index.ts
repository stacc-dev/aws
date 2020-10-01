import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import ws from 'express-ws'
import cors from 'cors'
import firebase from 'firebase-admin'
import { State } from './types'
import { TokenStore } from './store'

firebase.initializeApp({
  credential: firebase.credential.cert(
    JSON.parse(
      Buffer.from(
        process.env.GCLOUD_CREDENTIALS as string,
        'base64'
      ).toString()
    )
  ),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
})

const { app } = ws(express())
app.use(cors())

const tokenStore = new TokenStore()

tokenStore.on('realtime', (token, users) => {
  console.log(`${token} has ${users} realtime users`)
})

app.ws('/client', (socket) => {
  const state: State = {
    token: null,
    lastPing: -1,
    timeouts: [],
    intervals: []
  }

  const terminate = (message?: string) => {
    if (message) socket.send(message)
    for (let timeout of state.timeouts) clearTimeout(timeout)
    for (let interval of state.intervals) clearInterval(interval)
    if (state.token) tokenStore.decrement(state.token)
    if (socket.readyState === socket.OPEN) socket.close()
  }

  state.timeouts.push(setTimeout(() => {
    if (!state.token) terminate('Not initialized within 10 seconds')
  }, 10000))

  state.intervals.push(setInterval(() => {
    if (state.token && Date.now() - state.lastPing > 60000) {
      terminate('Ping not recieved in 1 minute')
    }
  }, 30000))

  socket.addEventListener('message', async (message) => {
    const { type, payload }: { type: string, payload: any } = JSON.parse(message.data as string)

    switch (type) {
      case 'INIT': {
        const websites = await firebase
          .firestore()
          .collection('websites')
          .where('token', '==', payload.token)
          .get()
        
        if (websites.empty) return terminate('Token invalid or website not found')
        state.token = payload.token as string
        tokenStore.increment(state.token)

        break
      }

      case 'PING': {
        state.lastPing = Date.now()
        break
      }
    }
  })

  socket.addEventListener('close', () => terminate())
})

app.ws('/server', (socket) => {
  const state: State = {
    token: null,
    lastPing: -1,
    timeouts: [],
    intervals: []
  }

  const listener = (token: string, users: number) => {
    if (token !== state.token) return
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'USERS', users }))
  }

  const terminate = (message?: string) => {
    if (message) socket.send(JSON.stringify({ type: 'MESSAGE', message }))
    for (let timeout of state.timeouts) clearTimeout(timeout)
    for (let interval of state.intervals) clearInterval(interval)
    tokenStore.off('realtime', listener)
    if (socket.readyState === socket.OPEN) socket.close()
  }
  
  socket.addEventListener('message', async (message) => {
    const { type, payload }: { type: string, payload: any } = JSON.parse(message.data as string)

    switch (type) {
      case 'INIT': {
        let user: firebase.auth.UserRecord
        try {
          const claims = await firebase.auth().verifyIdToken(payload.idToken, true)
          user = await firebase.auth().getUser(claims.uid)
        } catch (error) {
          return terminate('Invalid auth token')
        }

        const websites = await firebase
          .firestore()
          .collection('websites')
          .where('token', '==', payload.token)
          .get()
        if (websites.empty) return terminate('Token invalid or website not found')
        // if (websites.docs[0].get('uid') !== user.uid) return terminate('You aren\'t the owner')

        state.token = websites.docs[0].get('token') as string
        tokenStore.on('realtime', listener)
        listener(state.token, tokenStore.get(state.token))

        break
      }

      case 'PING': {
        state.lastPing = Date.now()
        break
      }
    }
  })

  socket.addEventListener('close', () => terminate())
})

app.listen(process.env.PORT || 4200, () => console.log('Server is up!'))
