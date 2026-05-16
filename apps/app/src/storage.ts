import AsyncStorage from '@react-native-async-storage/async-storage';

let _token: string | null = null;
let _did: string | null = null;

export const storage = {
  getToken: () => _token,
  getDid: () => _did,

  setToken: async (token: string | null) => {
    _token = token;
    if (token) await AsyncStorage.setItem('token', token);
    else await AsyncStorage.removeItem('token');
  },

  setDid: async (did: string | null) => {
    _did = did;
    if (did) await AsyncStorage.setItem('did', did);
    else await AsyncStorage.removeItem('did');
  },

  load: async () => {
    _token = await AsyncStorage.getItem('token');
    _did = await AsyncStorage.getItem('did');
    return { token: _token, did: _did };
  },

  clear: async () => {
    _token = null;
    _did = null;
    await AsyncStorage.multiRemove(['token', 'did', 'handle']);
  },
};
