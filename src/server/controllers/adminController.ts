import { Request, Response } from "express";
import { supabase } from "../config/supabase.ts";
import dotenv from "dotenv";

dotenv.config();

export const getSettings = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('settings').select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { api_enabled, active_model } = req.body;
    const { data, error } = await supabase
      .from('settings')
      .update({ api_enabled, active_model, updated_at: new Date() })
      .match({ id: req.body.id })
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update settings" });
  }
};

export const getApiKeys = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
};

export const createApiKey = async (req: Request, res: Response) => {
  try {
    const { site } = req.body;
    const newKey = `lex_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
    
    const { data, error } = await supabase
      .from('api_keys')
      .insert({ key: newKey, site, status: 'active' })
      .select()
      .single();
      
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create API key" });
  }
};

export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('api_keys')
      .update({ status: 'revoked' })
      .eq('id', id);
      
    if (error) throw error;
    res.json({ message: "Key revoked" });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to revoke key" });
  }
};

export const getDocs = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, content, site, context, metadata')
      .limit(100);
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

export const deleteDoc = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: "Document deleted" });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete document" });
  }
};
