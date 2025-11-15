import { useEffect, useState, useCallback } from "react";
import api from "../libs/apiClient";


export type User = {
id: number;
name: string;
email: string;
phone?: string | null;
gender?: string | null;
marital_status?: string | null;
dob?: string | null; // ISO date string
avatar_url?: string | null;
role?: string;
is_verified?: boolean;
created_at?: string | null;
};


export default function useUserProfile() {
const [user, setUser] = useState<User | null>(null);
const [loading, setLoading] = useState<boolean>(true);
const [error, setError] = useState<string | null>(null);


const fetchUser = useCallback(async () => {
setLoading(true);
setError(null);
try {
const res = await api.get<User>("/user/me");
setUser(res.data);
} catch (err: any) {
setError(err?.response?.data?.message || err.message || "Failed to fetch user");
} finally {
setLoading(false);
}
}, []);


useEffect(() => {
fetchUser();
}, [fetchUser]);


const updateUser = async (payload: Partial<User>) => {
setLoading(true);
try {
const res = await api.put<User>("/user/me", payload);
setUser(res.data);
return res.data;
} catch (err: any) {
throw new Error(err?.response?.data?.message || err.message || "Update failed");
} finally {
setLoading(false);
}
};


return { user, loading, error, fetchUser, updateUser } as const;
}