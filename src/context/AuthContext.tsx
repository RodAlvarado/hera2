import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendEmailVerification,
  reload,
  signOut, 
  onAuthStateChanged, 
  syncUserProfile, 
  UserProfile,
  db 
} from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (currentUser: User) => {
    try {
      const timeoutPromise = new Promise<UserProfile>((_, reject) =>
        setTimeout(() => reject(new Error('Profile sync timeout')), 3500)
      );
      const userDoc = await Promise.race([syncUserProfile(currentUser), timeoutPromise]);
      setProfile(userDoc);
    } catch (err) {
      console.error("Error fetching user profile, applying fallback profile:", err);
      const isRodrigoDev = currentUser.email?.toLowerCase() === 'rodrigoalto25@gmail.com';
      setProfile({
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario',
        photoURL: currentUser.photoURL || '',
        subscriptionStatus: isRodrigoDev ? 'active' : 'free_trial',
        subscriptionPlan: isRodrigoDev ? 'corp' : undefined,
        interviewsCount: 0,
        interviewsLimit: isRodrigoDev ? 100 : 2,
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        await fetchProfile(res.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await fetchProfile(res.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      if (res.user) {
        await updateProfile(res.user, { displayName: name });
        try {
          // Send Firebase verification email
          await sendEmailVerification(res.user);
        } catch (mailErr) {
          console.warn("Could not send verification email:", mailErr);
        }
        await fetchProfile(res.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    if (auth.currentUser) {
      await reload(auth.currentUser);
      const isVerified = auth.currentUser.emailVerified;
      setUser({ ...auth.currentUser });
      return isVerified;
    }
    return false;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      loginWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      sendVerificationEmail,
      checkEmailVerification,
      logout,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
