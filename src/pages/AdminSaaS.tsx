import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import {
  Settings as SettingsIcon,
  Key,
  Shield,
  Plus,
  Trash2,
  Power,
  CheckCircle2,
  Copy,
  BookOpen,
  UploadCloud,
  Loader2,
  AlertCircle,
  Menu,
  X,
  PlusCircle,
  ChevronRight,
  ChevronLeft,
  Zap,
  Link as LinkIcon,
  FileText,
  Eye,
  RefreshCw,
  Play,
  ExternalLink,
  Clock,
  Search,
  Users,
  Ban,
  Crown,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  FileWarning,
} from 'lucide-react';

interface SystemConfiguration {
  id: string;
  api_enabled: boolean;
  active_model: string;
}

interface ApiKey {
  id: string;
  key: string;
  site: string;
  status: 'active' | 'revoked';
  created_at: string;
}

interface Document {
  id: number | string;
  title: string;
  jurisdiction: string;
  document_type: string;
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'rejected';
  total_sections: number;
  processed_sections: number;
  error_log?: string | null;
  created_at: string;
  updated_at?: string;

  authority_level?: string | null;
  official_source?: string | null;
  source_url?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  current_status?: string | null;
  last_verified_at?: string | null;
  verification_source?: string | null;
  version_label?: string | null;
}

interface UserRecord {
  user_id: string;
  email: string;
  trial_messages_used: number;
  trial_limit: number;
  is_subscribed: boolean;
  subscription_tier: string;
  subscription_expires_at: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface QALog {
  id: string;
  benchmark_id: string;
  category: string;
  question_asked: string;
  ai_answer: string;
  what_was_wrong: string;
  why_it_was_wrong: string;
  correct_authority: string;
  general_training_rule: string;
  jurisdiction: string;
  passed: boolean;
  retest_status: string;
  tested_at: string;
}

interface ApiEnvelope<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  details?: any;
}

interface PreviewData {
  document: Document & {
    full_content: string;
  };
  analysis: {
    characters: number;
    pages_detected: number;
    sections_detected: number;
    sections: string[];
    planned_chunks: number;
    chunk_previews: Array<{
      index: number;
      section_number: string | null;
      subsection: string | null;
      source_locator: string;
      content: string;
    }>;
  };
}

type AdminTab = 'home' | 'settings' | 'keys' | 'docs' | 'users' | 'qa';

type IngestMode = 'text' | 'url' | 'file';

const BATCH_SIZE = 8;

export default function AdminSaaS() {
  useDocumentTitle('LexAI - Practice Control Portal');

  const [adminKey, setAdminKey] = useState<string>(
    localStorage.getItem('lex_admin_key') || ''
  );

  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] =
    useState<AdminTab>('home');

  const [settings, setSettings] =
    useState<SystemConfiguration | null>(null);

  const [apiKeys, setApiKeys] =
    useState<ApiKey[]>([]);

  const [docs, setDocs] =
    useState<Document[]>([]);

  const [users, setUsers] =
    useState<UserRecord[]>([]);

  const [qaLogs, setQaLogs] =
    useState<QALog[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [copiedKey, setCopiedKey] =
    useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [userActionLoading, setUserActionLoading] =
    useState<string | null>(null);

  const [ingestPanelOpen, setIngestPanelOpen] =
    useState(false);

  const [previewOpen, setPreviewOpen] =
    useState(false);

  const [preview, setPreview] =
    useState<PreviewData | null>(null);

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [selectedDocument, setSelectedDocument] =
    useState<Document | null>(null);

  const [isIndexing, setIsIndexing] =
    useState(false);

  const [indexingDocumentId, setIndexingDocumentId] =
    useState<number | string | null>(null);

  const [indexingMessage, setIndexingMessage] =
    useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // INGESTION FORM
  // ---------------------------------------------------------------------------

  const [ingestMode, setIngestMode] =
    useState<IngestMode>('text');

  const [docTitle, setDocTitle] =
    useState('');

  const [docType, setDocType] =
    useState('statute');

  const [knowledgeText, setKnowledgeText] =
    useState('');

  const [knowledgeJur, setKnowledgeJurisdiction] =
    useState('nigeria');

  const [authorityLevel, setAuthorityLevel] =
    useState('primary');

  const [currentStatus, setCurrentStatus] =
    useState('unverified');

  const [versionLabel, setVersionLabel] =
    useState('');

  const [officialSource, setOfficialSource] =
    useState('');

  const [sourceUrl, setSourceUrl] =
    useState('');

  const [effectiveFrom, setEffectiveFrom] =
    useState('');

  const [effectiveTo, setEffectiveTo] =
    useState('');

  const [verificationSource, setVerificationSource] =
    useState('');

  const [importUrl, setImportUrl] =
    useState('');

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [isUploading, setIsUploading] =
    useState(false);

  const [uploadSuccess, setUploadSuccess] =
    useState<string | null>(null);

  const [uploadError, setUploadError] =
    useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // API HELPERS
  // ---------------------------------------------------------------------------

  const adminHeaders = useCallback(
    (json = false): HeadersInit => ({
      ...(json
        ? { 'Content-Type': 'application/json' }
        : {}),
      'x-admin-key': adminKey,
    }),
    [adminKey]
  );

  const parseResponse = async <T,>(
    response: Response
  ): Promise<ApiEnvelope<T>> => {
    const text = await response.text();

    let parsed: any = null;

    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = {
        success: false,
        error:
          text ||
          `Request failed with HTTP ${response.status}`,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        data: null as T,
        error:
          parsed?.error ||
          parsed?.message ||
          `Request failed with HTTP ${response.status}`,
        details: parsed?.details,
      };
    }

    return parsed;
  };

  // ---------------------------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (adminKey) {
      validateAndFetch();
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isAuth && (activeTab === 'docs' || activeTab === 'users')) {
      interval = setInterval(() => {
        fetchData();
      }, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isAuth, activeTab]);

  const validateAndFetch = async () => {
    if (!adminKey.trim()) {
      setIsAuth(false);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        '/api/admin/settings',
        {
          headers: adminHeaders(),
        }
      );

      const result =
        await parseResponse<SystemConfiguration>(
          res
        );

      if (res.ok && result.success) {
        setSettings(result.data);
        setIsAuth(true);

        localStorage.setItem(
          'lex_admin_key',
          adminKey
        );

        await fetchData();
      } else {
        setIsAuth(false);
      }
    } catch (error) {
      console.error(error);
      setIsAuth(false);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // FETCH DATA
  // ---------------------------------------------------------------------------

  const fetchData = async () => {
    if (!adminKey) return;

    try {
      const [
        settingsRes,
        keysRes,
        docsRes,
        usersRes,
        qaRes,
      ] = await Promise.all([
        fetch('/api/admin/settings', {
          headers: adminHeaders(),
        }),
        fetch('/api/admin/keys', {
          headers: adminHeaders(),
        }),
        fetch('/api/admin/documents', {
          headers: adminHeaders(),
        }),
        fetch('/api/admin/users', {
          headers: adminHeaders(),
        }),
        fetch('/api/admin/qa/logs', {
          headers: adminHeaders(),
        }),
      ]);

      if (settingsRes.ok) {
        const result =
          await parseResponse<SystemConfiguration>(
            settingsRes
          );

        if (result.success) {
          setSettings(result.data);
        }
      }

      if (keysRes.ok) {
        const result =
          await parseResponse<ApiKey[]>(
            keysRes
          );

        if (result.success) {
          setApiKeys(result.data || []);
        }
      }

      if (docsRes.ok) {
        const result =
          await parseResponse<Document[]>(
            docsRes
          );

        if (result.success) {
          setDocs(result.data || []);
        }
      }

      if (usersRes.ok) {
        const result =
          await parseResponse<UserRecord[]>(
            usersRes
          );

        if (result.success) {
          setUsers(result.data || []);
        }
      }

      if (qaRes.ok) {
        const result =
          await parseResponse<QALog[]>(
            qaRes
          );

        if (result.success) {
          setQaLogs(result.data || []);
        }
      }
    } catch (error) {
      console.error(
        'Admin data fetch failed:',
        error
      );
    }
  };

  // ---------------------------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------------------------

  const handleToggleSystem = async () => {
    if (!settings) return;

    const updated =
      !settings.api_enabled;

    try {
      const res = await fetch(
        '/api/admin/settings',
        {
          method: 'PATCH',
          headers: adminHeaders(true),
          body: JSON.stringify({
            api_enabled: updated,
          }),
        }
      );

      const result =
        await parseResponse<SystemConfiguration>(
          res
        );

      if (res.ok && result.success) {
        setSettings(result.data);
      } else {
        alert(
          result.error ||
            'Unable to update system status.'
        );
      }
    } catch {
      alert(
        'Unable to update system status.'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // CLIENT KEYS
  // ---------------------------------------------------------------------------

  const handleCreateKey = async () => {
    const firmName = prompt(
      'Enter Law Firm / Client Name:'
    );

    if (!firmName?.trim()) return;

    try {
      const res = await fetch(
        '/api/admin/keys',
        {
          method: 'POST',
          headers: adminHeaders(true),
          body: JSON.stringify({
            site: firmName.trim(),
          }),
        }
      );

      const result =
        await parseResponse<ApiKey>(res);

      if (res.ok && result.success) {
        await fetchData();

        if (result.data?.key) {
          alert(
            `Client license created.\n\nAccess key:\n${result.data.key}`
          );
        }
      } else {
        alert(
          result.error ||
            'Unable to create client license.'
        );
      }
    } catch {
      alert(
        'Unable to create client license.'
      );
    }
  };

  const handleRevokeKey = async (
    id: string
  ) => {
    if (
      !confirm(
        'Revoke access for this client key?'
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/keys/${id}`,
        {
          method: 'DELETE',
          headers: adminHeaders(),
        }
      );

      const result =
        await parseResponse(res);

      if (res.ok && result.success) {
        await fetchData();
      } else {
        alert(
          result.error ||
            'Unable to revoke license.'
        );
      }
    } catch {
      alert(
        'Unable to revoke license.'
      );
    }
  };

  const handleCopyKey = (
    key: string
  ) => {
    navigator.clipboard.writeText(key);

    setCopiedKey(key);

    setTimeout(
      () => setCopiedKey(null),
      2000
    );
  };

  // ---------------------------------------------------------------------------
  // USER MANAGEMENT
  // ---------------------------------------------------------------------------

  const handleUpgradeUser = async (
    userId: string
  ) => {
    setUserActionLoading(userId);

    try {
      const expires = new Date();
      expires.setMonth(
        expires.getMonth() + 1
      );

      const res = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: 'PATCH',
          headers: adminHeaders(true),
          body: JSON.stringify({
            is_subscribed: true,
            subscription_tier: 'premium',
            subscription_expires_at:
              expires.toISOString(),
          }),
        }
      );

      const result =
        await parseResponse(res);

      if (res.ok && result.success) {
        await fetchData();
      } else {
        alert(
          result.error ||
            'Failed to upgrade user.'
        );
      }
    } catch {
      alert('Failed to upgrade user.');
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleDowngradeUser = async (
    userId: string
  ) => {
    if (
      !confirm(
        'Downgrade this user to free tier?'
      )
    ) {
      return;
    }

    setUserActionLoading(userId);

    try {
      const res = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: 'PATCH',
          headers: adminHeaders(true),
          body: JSON.stringify({
            is_subscribed: false,
            subscription_tier: 'free',
          }),
        }
      );

      const result =
        await parseResponse(res);

      if (res.ok && result.success) {
        await fetchData();
      } else {
        alert(
          result.error ||
            'Failed to downgrade user.'
        );
      }
    } catch {
      alert('Failed to downgrade user.');
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleBanUser = async (
    userId: string,
    currentlyBanned: boolean
  ) => {
    if (!currentlyBanned) {
      const reason = prompt(
        'Reason for banning this user:'
      );

      if (!reason?.trim()) return;

      setUserActionLoading(userId);

      try {
        const res = await fetch(
          `/api/admin/users/${userId}`,
          {
            method: 'PATCH',
            headers: adminHeaders(true),
            body: JSON.stringify({
              is_banned: true,
              ban_reason: reason.trim(),
            }),
          }
        );

        const result =
          await parseResponse(res);

        if (res.ok && result.success) {
          await fetchData();
        } else {
          alert(
            result.error ||
              'Failed to ban user.'
          );
        }
      } catch {
        alert('Failed to ban user.');
      } finally {
        setUserActionLoading(null);
      }
    } else {
      setUserActionLoading(userId);

      try {
        const res = await fetch(
          `/api/admin/users/${userId}`,
          {
            method: 'PATCH',
            headers: adminHeaders(true),
            body: JSON.stringify({
              is_banned: false,
            }),
          }
        );

        const result =
          await parseResponse(res);

        if (res.ok && result.success) {
          await fetchData();
        } else {
          alert(
            result.error ||
              'Failed to unban user.'
          );
        }
      } catch {
        alert('Failed to unban user.');
      } finally {
        setUserActionLoading(null);
      }
    }
  };

  const handleIncreaseTokens = async (
    userId: string
  ) => {
    const amount = prompt(
      'Enter new message limit (e.g. 50, 100, 500):'
    );

    if (!amount || isNaN(Number(amount))) return;

    setUserActionLoading(userId);

    try {
      const res = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: 'PATCH',
          headers: adminHeaders(true),
          body: JSON.stringify({
            trial_limit: Number(amount),
            trial_messages_used: 0,
          }),
        }
      );

      const result =
        await parseResponse(res);

      if (res.ok && result.success) {
        await fetchData();
      } else {
        alert(
          result.error ||
            'Failed to update tokens.'
        );
      }
    } catch {
      alert('Failed to update tokens.');
    } finally {
      setUserActionLoading(null);
    }
  };

  // ---------------------------------------------------------------------------
  // RESET INGEST FORM
  // ---------------------------------------------------------------------------

  const resetIngestForm = () => {
    setDocTitle('');
    setDocType('statute');
    setKnowledgeText('');
    setKnowledgeJurisdiction('nigeria');
    setAuthorityLevel('primary');
    setCurrentStatus('unverified');
    setVersionLabel('');
    setOfficialSource('');
    setSourceUrl('');
    setEffectiveFrom('');
    setEffectiveTo('');
    setVerificationSource('');
    setImportUrl('');
    setSelectedFile(null);

    setUploadError(null);
    setUploadSuccess(null);
  };

  // ---------------------------------------------------------------------------
  // OPEN INGEST PANEL
  // ---------------------------------------------------------------------------

  const openIngestPanel = () => {
    resetIngestForm();
    setIngestMode('text');
    setIngestPanelOpen(true);
  };

  // ---------------------------------------------------------------------------
  // CREATE TEXT DOCUMENT
  // ---------------------------------------------------------------------------

  const createTextDocument = async () => {
    if (!docTitle.trim()) {
      throw new Error(
        'Please provide a document title.'
      );
    }

    if (
      knowledgeText.trim().length <
      10
    ) {
      throw new Error(
        'Please enter at least 10 characters of legal content.'
      );
    }

    const res = await fetch(
      '/api/admin/documents',
      {
        method: 'POST',
        headers: adminHeaders(true),
        body: JSON.stringify({
          title: docTitle.trim(),
          document_type: docType,
          jurisdiction: knowledgeJur,
          authority_level:
            authorityLevel,
          current_status:
            currentStatus,
          version_label:
            versionLabel.trim() ||
            null,
          official_source:
            officialSource.trim() ||
            null,
          source_url:
            sourceUrl.trim() ||
            null,
          effective_from:
            effectiveFrom || null,
          effective_to:
            effectiveTo || null,
          verification_source:
            verificationSource.trim() ||
            null,
          content:
            knowledgeText.trim(),
        }),
      }
    );

    const result =
      await parseResponse<Document>(
        res
      );

    if (!res.ok || !result.success) {
      throw new Error(
        result.error ||
          'Unable to create document.'
      );
    }

    return result.data;
  };

  // ---------------------------------------------------------------------------
  // IMPORT URL
  // ---------------------------------------------------------------------------

  const importDocumentUrl = async () => {
    if (!importUrl.trim()) {
      throw new Error(
        'Please enter the official document URL.'
      );
    }

    const res = await fetch(
      '/api/admin/documents/import-url',
      {
        method: 'POST',
        headers: adminHeaders(true),
        body: JSON.stringify({
          url: importUrl.trim(),
          title:
            docTitle.trim() ||
            null,
          document_type: docType,
          jurisdiction: knowledgeJur,
          authority_level:
            authorityLevel,
          current_status:
            currentStatus,
          version_label:
            versionLabel.trim() ||
            null,
          official_source:
            officialSource.trim() ||
            null,
          effective_from:
            effectiveFrom || null,
          effective_to:
            effectiveTo || null,
          verification_source:
            verificationSource.trim() ||
            null,
        }),
      }
    );

    const result =
      await parseResponse<any>(res);

    if (!res.ok || !result.success) {
      throw new Error(
        result.error ||
          'Unable to import URL.'
      );
    }

    return result.data;
  };

  // ---------------------------------------------------------------------------
  // UPLOAD FILE
  // ---------------------------------------------------------------------------

  const uploadDocumentFile = async () => {
    if (!selectedFile) {
      throw new Error(
        'Please select a PDF, HTML, or text file.'
      );
    }

    const formData =
      new FormData();

    formData.append(
      'file',
      selectedFile
    );

    if (docTitle.trim()) {
      formData.append(
        'title',
        docTitle.trim()
      );
    }

    formData.append(
      'document_type',
      docType
    );

    formData.append(
      'jurisdiction',
      knowledgeJur
    );

    formData.append(
      'authority_level',
      authorityLevel
    );

    formData.append(
      'current_status',
      currentStatus
    );

    if (versionLabel.trim()) {
      formData.append(
        'version_label',
        versionLabel.trim()
      );
    }

    if (officialSource.trim()) {
      formData.append(
        'official_source',
        officialSource.trim()
      );
    }

    if (sourceUrl.trim()) {
      formData.append(
        'source_url',
        sourceUrl.trim()
      );
    }

    if (effectiveFrom) {
      formData.append(
        'effective_from',
        effectiveFrom
      );
    }

    if (effectiveTo) {
      formData.append(
        'effective_to',
        effectiveTo
      );
    }

    if (verificationSource.trim()) {
      formData.append(
        'verification_source',
        verificationSource.trim()
      );
    }

    const res = await fetch(
      '/api/admin/documents/upload',
      {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey,
        },
        body: formData,
      }
    );

    const result =
      await parseResponse<any>(res);

    if (!res.ok || !result.success) {
      throw new Error(
        result.error ||
          'Unable to upload file.'
      );
    }

    return result.data;
  };

  // ---------------------------------------------------------------------------
  // INGEST SUBMIT
  // ---------------------------------------------------------------------------

  const handleIngestKnowledge = async (
    e?: React.FormEvent
  ) => {
    e?.preventDefault();

    if (isUploading) return;

    setUploadError(null);
    setUploadSuccess(null);

    setIsUploading(true);

    try {
      let result: any;

      if (ingestMode === 'text') {
        result =
          await createTextDocument();
      } else if (
        ingestMode === 'url'
      ) {
        result =
          await importDocumentUrl();
      } else {
        result =
          await uploadDocumentFile();
      }

      const createdDocument =
        result?.document ||
        result;

      setUploadSuccess(
        'Document imported successfully. Review the preview before indexing.'
      );

      await fetchData();

      if (createdDocument?.id) {
        await openPreview(
          createdDocument.id
        );
      }

      setIngestPanelOpen(false);

      resetIngestForm();
    } catch (error: any) {
      setUploadError(
        error?.message ||
          'Unable to register the legal document.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // PREVIEW
  // ---------------------------------------------------------------------------

  const openPreview = async (
    id: number | string
  ) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setPreview(null);

    try {
      const res = await fetch(
        `/api/admin/documents/${id}/preview`,
        {
          headers: adminHeaders(),
        }
      );

      const result =
        await parseResponse<PreviewData>(
          res
        );

      if (
        res.ok &&
        result.success
      ) {
        setPreview(result.data);

        setSelectedDocument(
          result.data.document
        );
      } else {
        throw new Error(
          result.error ||
            'Unable to load preview.'
        );
      }
    } catch (error: any) {
      alert(
        error?.message ||
          'Unable to load document preview.'
      );

      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // INDEX DOCUMENT IN BATCHES
  // ---------------------------------------------------------------------------

  const indexDocument = async (
    document: Document,
    reset = false
  ) => {
    if (isIndexing) return;

    setIsIndexing(true);
    setIndexingDocumentId(
      document.id
    );

    setIndexingMessage(
      reset
        ? 'Preparing document for indexing...'
        : 'Starting legal knowledge indexing...'
    );

    try {
      let offset =
        reset
          ? 0
          : Number(
              document.processed_sections ||
                0
            );

      let completed = false;

      let safetyCounter = 0;

      while (
        !completed &&
        safetyCounter < 500
      ) {
        safetyCounter++;

        setIndexingMessage(
          offset > 0
            ? `Indexing legal knowledge... ${offset} chunks processed`
            : 'Indexing legal knowledge...'
        );

        const endpoint =
          `/api/admin/documents/${document.id}/index?offset=${offset}&batch_size=${BATCH_SIZE}${
            reset && offset === 0
              ? '&reset=true'
              : ''
          }`;

        const res = await fetch(
          endpoint,
          {
            method: 'POST',
            headers:
              adminHeaders(true),
            body: JSON.stringify({
              offset,
              batch_size:
                BATCH_SIZE,
              reset:
                reset &&
                offset === 0,
            }),
          }
        );

        const result =
          await parseResponse<any>(
            res
          );

        if (
          !res.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              'Indexing failed.'
          );
        }

        const data =
          result.data;

        completed =
          Boolean(
            data.completed
          );

        offset =
          Number(
            data.next_offset ??
              offset
          );

        await fetchData();

        if (
          data.errors?.length
        ) {
          throw new Error(
            data.errors.join('\n')
          );
        }
      }

      if (!completed) {
        throw new Error(
          'Indexing stopped after the maximum number of batches.'
        );
      }

      setIndexingMessage(
        'Legal document indexed successfully.'
      );

      await fetchData();
    } catch (error: any) {
      setIndexingMessage(null);

      alert(
        error?.message ||
          'Document indexing failed.'
      );

      await fetchData();
    } finally {
      setIsIndexing(false);
      setIndexingDocumentId(
        null
      );
    }
  };

  // ---------------------------------------------------------------------------
  // DELETE DOCUMENT
  // ---------------------------------------------------------------------------

  const handleDeleteDocument = async (
    id: number | string
  ) => {
    if (
      !confirm(
        'Permanently delete this document and all indexed chunks from LexAI?'
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/documents/${id}`,
        {
          method: 'DELETE',
          headers: adminHeaders(),
        }
      );

      const result =
        await parseResponse(res);

      if (
        res.ok &&
        result.success
      ) {
        await fetchData();
      } else {
        alert(
          result.error ||
            'Failed to remove document.'
        );
      }
    } catch {
      alert(
        'Failed to remove document.'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // AUTH SCREEN
  // ---------------------------------------------------------------------------

  if (!isAuth) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{
            opacity: 0,
            y: 15,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 p-6 rounded-3xl text-center shadow-2xl"
        >
          <div className="w-12 h-12 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Shield size={24} />
          </div>

          <h2 className="text-xl font-bold text-white mb-1">
            Practice Control Portal
          </h2>

          <p className="text-slate-400 text-xs mb-6 leading-relaxed">
            Enter master authorization key
            to continue
          </p>

          <input
            type="password"
            value={adminKey}
            onChange={(e) =>
              setAdminKey(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (
                e.key === 'Enter'
              ) {
                validateAndFetch();
              }
            }}
            placeholder="••••••••••••••••"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 px-4 text-white mb-4 text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
          />

          <button
            onClick={validateAndFetch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-all"
          >
            {loading
              ? 'Authenticating...'
              : 'Access Workspace'}
          </button>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ADMIN FEATURES
  // ---------------------------------------------------------------------------

  const adminFeatures = [
    {
      id: 'settings' as AdminTab,
      label: 'Practice Status',
      icon: SettingsIcon,
      desc: 'Enable or disable AI access across all legal workspaces',
      color:
        'from-emerald-500/20 to-emerald-600/5',
      iconColor:
        'text-emerald-400',
    },
    {
      id: 'keys' as AdminTab,
      label: 'Client Firm Licenses',
      icon: Key,
      desc: 'Generate or revoke access keys for client law firms',
      color:
        'from-amber-500/20 to-amber-600/5',
      iconColor:
        'text-amber-400',
      badge:
        apiKeys.filter(
          (k) => k.status === 'active'
        ).length,
    },
    {
      id: 'docs' as AdminTab,
      label: 'Statutory Library',
      icon: BookOpen,
      desc: 'Manage statutes, amendments, cases and verified legal sources',
      color:
        'from-blue-500/20 to-blue-600/5',
      iconColor:
        'text-blue-400',
      badge: docs.length,
    },
    {
      id: 'users' as AdminTab,
      label: 'User Management',
      icon: Users,
      desc: 'View users, grant premium, ban, or adjust token limits',
      color:
        'from-purple-500/20 to-purple-600/5',
      iconColor:
        'text-purple-400',
      badge: users.length,
    },
    {
      id: 'qa' as AdminTab,
      label: 'QA Error Logs',
      icon: FileWarning,
      desc: 'Review AI errors, training rules, and benchmark tests',
      color:
        'from-orange-500/20 to-orange-600/5',
      iconColor:
        'text-orange-400',
      badge: qaLogs.filter(
        (l) => !l.passed
      ).length,
    },
  ];

  const currentFeature =
    adminFeatures.find(
      (f) => f.id === activeTab
    );

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-300 flex flex-col md:flex-row font-sans relative">

      {/* MOBILE HEADER */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-slate-800 fixed top-0 inset-x-0 z-40 backdrop-blur-md h-14">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab !== 'home' ? (
            <button
              onClick={() =>
                setActiveTab('home')
              }
              className="p-1.5 -ml-1 rounded-lg hover:bg-slate-800 text-slate-300 bg-transparent border-0 cursor-pointer transition-colors shrink-0"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-white font-black text-xs shrink-0">
              LA
            </div>
          )}

          <span className="font-bold text-white text-sm truncate">
            {activeTab === 'home'
              ? 'Counsel Admin'
              : currentFeature?.label}
          </span>
        </div>

        <button
          onClick={() =>
            setSidebarOpen(
              !sidebarOpen
            )
          }
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-0 cursor-pointer transition-colors shrink-0"
        >
          {sidebarOpen ? (
            <X size={18} />
          ) : (
            <Menu size={18} />
          )}
        </button>
      </header>

      {/* MOBILE SIDEBAR */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              onClick={() =>
                setSidebarOpen(false)
              }
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
            />

            <motion.aside
              initial={{
                x: '-100%',
              }}
              animate={{
                x: 0,
              }}
              exit={{
                x: '-100%',
              }}
              transition={{
                type: 'spring',
                damping: 26,
                stiffness: 220,
              }}
              className="fixed top-0 bottom-0 left-0 w-72 bg-[#0c0d12] border-r border-slate-900 p-6 flex flex-col justify-between z-50 md:hidden shadow-2xl"
            >
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
                      LA
                    </div>

                    <span className="font-bold text-white text-base">
                      Counsel Admin
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      setSidebarOpen(
                        false
                      )
                    }
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <nav className="space-y-1">
                  <button
                    onClick={() => {
                      setActiveTab(
                        'home'
                      );
                      setSidebarOpen(
                        false
                      );
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                      activeTab ===
                        'home'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-400 hover:bg-slate-900'
                    )}
                  >
                    <Zap size={15} />
                    Dashboard Hub
                  </button>

                  {adminFeatures.map(
                    (tab) => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(
                            tab.id
                          );
                          setSidebarOpen(
                            false
                          );
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                          activeTab ===
                            tab.id
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-400 hover:bg-slate-900'
                        )}
                      >
                        <tab.icon
                          size={15}
                        />
                        {tab.label}
                      </button>
                    )
                  )}
                </nav>
              </div>

              <button
                onClick={() => {
                  localStorage.removeItem(
                    'lex_admin_key'
                  );
                  window.location.reload();
                }}
                className="flex items-center gap-2.5 text-xs font-bold text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer py-2 px-3 hover:bg-rose-500/10 rounded-xl transition-all"
              >
                <Power size={13} />
                SIGN OUT
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex sticky top-0 h-screen w-64 bg-[#0c0d12] border-r border-slate-900 p-6 flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">
              LA
            </div>

            <span className="font-bold text-white text-base">
              Counsel Admin
            </span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() =>
                setActiveTab('home')
              }
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                activeTab ===
                  'home'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:bg-slate-900'
              )}
            >
              <Zap size={15} />
              Dashboard Hub
            </button>

            {adminFeatures.map(
              (tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveTab(
                      tab.id
                    )
                  }
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                    activeTab ===
                      tab.id
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-slate-400 hover:bg-slate-900'
                  )}
                >
                  <tab.icon
                    size={15}
                  />
                  {tab.label}
                </button>
              )
            )}
          </nav>
        </div>

        <button
          onClick={() => {
            localStorage.removeItem(
              'lex_admin_key'
            );
            window.location.reload();
          }}
          className="flex items-center gap-2.5 text-xs font-bold text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer py-2 px-3 hover:bg-rose-500/10 rounded-xl transition-all"
        >
          <Power size={13} />
          SIGN OUT
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-grow overflow-y-auto max-w-full pt-14 md:pt-0">
        <div className="p-4 sm:p-6 md:p-10">

          {/* HOME */}
          {activeTab === 'home' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Practice Dashboard
                </h3>

                <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
                  Manage access, users, client
                  licenses and verified
                  legal knowledge.
                </p>
              </div>

              <div
                className={cn(
                  'p-5 rounded-3xl border flex items-center gap-4 shadow-xl',
                  settings?.api_enabled
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-rose-500/5 border-rose-500/20'
                )}
              >
                <div
                  className={cn(
                    'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
                    settings?.api_enabled
                      ? 'bg-emerald-500/15'
                      : 'bg-rose-500/15'
                  )}
                >
                  <Zap
                    size={20}
                    className={
                      settings?.api_enabled
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  />
                </div>

                <div className="min-w-0 flex-grow">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    SaaS System Status
                  </p>

                  <p
                    className={cn(
                      'text-base font-bold',
                      settings?.api_enabled
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    )}
                  >
                    {settings?.api_enabled
                      ? 'Active and Processing Inquiries'
                      : 'System Offline / Maintenance'}
                  </p>
                </div>

                <button
                  onClick={
                    handleToggleSystem
                  }
                  className={cn(
                    'w-11 h-6 rounded-full relative border-0 cursor-pointer shrink-0 transition-colors',
                    settings?.api_enabled
                      ? 'bg-emerald-500'
                      : 'bg-slate-700'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 bg-white rounded-full absolute top-1 transition-all',
                      settings?.api_enabled
                        ? 'left-6'
                        : 'left-1'
                    )}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {adminFeatures.map(
                  (feature) => (
                    <button
                      key={feature.id}
                      onClick={() =>
                        setActiveTab(
                          feature.id
                        )
                      }
                      className={cn(
                        'relative p-5 rounded-3xl bg-gradient-to-br border border-slate-800 text-left cursor-pointer transition-all hover:border-slate-700 hover:scale-[1.01] active:scale-[0.98] group overflow-hidden',
                        feature.color
                      )}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div
                          className={cn(
                            'w-11 h-11 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-center',
                            feature.iconColor
                          )}
                        >
                          <feature.icon
                            size={20}
                          />
                        </div>

                        {feature.badge !== undefined && feature.badge > 0 && (
                          <span className="text-[9px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                            {feature.badge}
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-white text-sm mb-1">
                        {feature.label}
                      </h4>

                      <p className="text-xs text-slate-400 leading-relaxed pr-6">
                        {feature.desc}
                      </p>

                      <ChevronRight
                        size={16}
                        className="absolute right-5 bottom-5 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all"
                      />
                    </button>
                  )
                )}
              </div>
            </motion.div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="max-w-xl mx-auto space-y-6"
            >
              <div className="hidden md:block">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Practice Status
                </h3>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between shadow-xl">
                <div>
                  <h4 className="font-bold text-white text-sm sm:text-base">
                    Global AI Intelligence
                    Access
                  </h4>

                  <p className="text-xs text-slate-400 mt-0.5">
                    Toggle availability
                    across legal
                    workspaces.
                  </p>
                </div>

                <button
                  onClick={
                    handleToggleSystem
                  }
                  className={cn(
                    'w-12 h-7 rounded-full transition-colors relative border-0 cursor-pointer self-start sm:self-auto shrink-0',
                    settings?.api_enabled
                      ? 'bg-emerald-600'
                      : 'bg-slate-700'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 bg-white rounded-full absolute top-1 transition-all',
                      settings?.api_enabled
                        ? 'left-6'
                        : 'left-1'
                    )}
                  />
                </button>
              </div>
            </motion.div>
          )}

          {/* KEYS */}
          {activeTab === 'keys' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Client Firm Licenses
                  </h3>
                </div>

                <button
                  onClick={
                    handleCreateKey
                  }
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg"
                >
                  <Plus size={15} />
                  New Client License
                </button>
              </div>

              <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">
                        Firm / Client
                      </th>
                      <th className="p-4">
                        Access Key
                      </th>
                      <th className="p-4">
                        Status
                      </th>
                      <th className="p-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800/60">
                    {apiKeys.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-8 text-center text-slate-500"
                        >
                          No licenses issued
                          yet.
                        </td>
                      </tr>
                    ) : (
                      apiKeys.map(
                        (k) => (
                          <tr
                            key={k.id}
                            className="hover:bg-slate-950/25 transition-colors"
                          >
                            <td className="p-4 font-bold text-white">
                              {k.site}
                            </td>

                            <td className="p-4 font-mono text-xs text-slate-400">
                              {k.key.substring(
                                0,
                                10
                              )}
                              ••••••••••
                              <button
                                onClick={() =>
                                  handleCopyKey(
                                    k.key
                                  )
                                }
                                className="ml-2 text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer"
                              >
                                {copiedKey ===
                                k.key ? (
                                  <CheckCircle2
                                    size={
                                      12
                                    }
                                    className="inline text-emerald-400"
                                  />
                                ) : (
                                  <Copy
                                    size={
                                      12
                                    }
                                    className="inline"
                                  />
                                )}
                              </button>
                            </td>

                            <td className="p-4">
                              <span
                                className={cn(
                                  'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border',
                                  k.status ===
                                    'active'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                )}
                              >
                                {k.status}
                              </span>
                            </td>

                            <td className="p-4 text-right">
                              {k.status ===
                                'active' && (
                                <button
                                  onClick={() =>
                                    handleRevokeKey(
                                      k.id
                                    )
                                  }
                                  className="text-rose-400 hover:text-rose-300 hover:underline text-xs font-bold bg-transparent border-0 cursor-pointer"
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="block sm:hidden space-y-3">
                {apiKeys.length ===
                0 ? (
                  <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center">
                    <Key
                      size={28}
                      className="mx-auto mb-3 text-slate-600"
                    />
                    <p className="text-xs text-slate-500">
                      No client
                      licenses issued
                      yet.
                    </p>
                  </div>
                ) : (
                  apiKeys.map(
                    (k) => (
                      <div
                        key={k.id}
                        className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm truncate pr-2">
                            {k.site}
                          </span>

                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border shrink-0',
                              k.status ===
                                'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                            )}
                          >
                            {k.status}
                          </span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-xl flex items-center justify-between border border-slate-800/50">
                          <code className="font-mono text-[10px] text-slate-400 truncate pr-2">
                            {k.key.substring(
                              0,
                              10
                            )}
                            ••••••••••
                          </code>

                          <button
                            onClick={() =>
                              handleCopyKey(
                                k.key
                              )
                            }
                            className="text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer shrink-0"
                          >
                            {copiedKey ===
                            k.key ? (
                              <CheckCircle2
                                size={
                                  13
                                }
                                className="text-emerald-400"
                              />
                            ) : (
                              <Copy
                                size={
                                  13
                                }
                              />
                            )}
                          </button>
                        </div>

                        {k.status ===
                          'active' && (
                          <button
                            onClick={() =>
                              handleRevokeKey(
                                k.id
                              )
                            }
                            className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all"
                          >
                            Revoke Access
                          </button>
                        )}
                      </div>
                    )
                  )
                )}
              </div>
            </motion.div>
          )}

          {/* DOCUMENTS */}
          {activeTab === 'docs' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="max-w-5xl mx-auto space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Statutory Library
                  </h3>

                  <p className="text-xs text-slate-400 mt-1">
                    Import, verify, preview and
                    index legal authorities.
                  </p>
                </div>

                <button
                  onClick={
                    openIngestPanel
                  }
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg shadow-blue-600/15"
                >
                  <PlusCircle
                    size={15}
                  />
                  Teach LexAI New Knowledge
                </button>
              </div>

              {/* DESKTOP DOCUMENT TABLE */}
              <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">
                        Jurisdiction
                      </th>
                      <th className="p-4">
                        Type
                      </th>
                      <th className="p-4">
                        Authority
                      </th>
                      <th className="p-4">
                        Title
                      </th>
                      <th className="p-4">
                        Progress
                      </th>
                      <th className="p-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800/60">
                    {docs.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-500"
                        >
                          No legal documents
                          registered.
                        </td>
                      </tr>
                    ) : (
                      docs.map(
                        (doc) => (
                          <tr
                            key={doc.id}
                            className="group hover:bg-slate-950/25 transition-colors"
                          >
                            <td className="p-4 font-bold text-blue-400 uppercase text-xs">
                              {doc.jurisdiction ===
                              'nigeria'
                                ? '🇳🇬 NIGERIA'
                                : '🇺🇸 US LAW'}
                            </td>

                            <td className="p-4 text-slate-400 text-xs font-semibold capitalize">
                              {doc.document_type}
                            </td>

                            <td className="p-4">
                              <span
                                className={cn(
                                  'text-[9px] px-2 py-1 rounded-full border uppercase font-bold',
                                  doc.authority_level ===
                                    'primary'
                                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                    : doc.authority_level ===
                                        'secondary'
                                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                      : 'text-slate-400 bg-slate-500/10 border-slate-500/20'
                                )}
                              >
                                {doc.authority_level ||
                                  'primary'}
                              </span>
                            </td>

                            <td className="p-4 text-slate-200 text-xs font-bold max-w-xs">
                              <button
                                onClick={() =>
                                  openPreview(
                                    doc.id
                                  )
                                }
                                className="text-left hover:text-blue-400 transition-colors"
                              >
                                {doc.title}
                              </button>

                              {doc.version_label && (
                                <div className="text-[9px] text-slate-500 mt-1">
                                  {doc.version_label}
                                </div>
                              )}
                            </td>

                            <td className="p-4 align-middle">
                              {doc.status ===
                              'processing' ? (
                                <div className="flex items-center gap-2">
                                  <Loader2
                                    size={
                                      13
                                    }
                                    className="animate-spin text-blue-500"
                                  />

                                  <span className="text-[11px] text-blue-400 font-mono">
                                    {doc.processed_sections}/
                                    {doc.total_sections ||
                                      '?'}
                                  </span>
                                </div>
                              ) : doc.status ===
                                'completed' ? (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/25">
                                  Ready
                                </span>
                              ) : doc.status ===
                                'failed' ? (
                                <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/25">
                                  Failed
                                </span>
                              ) : doc.status ===
                                'rejected' ? (
                                <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/25">
                                  Rejected
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-500/10 px-2.5 py-0.5 rounded-full border border-slate-500/25">
                                  Pending
                                </span>
                              )}
                            </td>

                            <td className="p-4 text-right align-middle">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() =>
                                    openPreview(
                                      doc.id
                                    )
                                  }
                                  title="Preview"
                                  className="text-slate-500 hover:text-blue-400 p-2 bg-transparent border-0 cursor-pointer"
                                >
                                  <Eye
                                    size={
                                      14
                                    }
                                  />
                                </button>

                                {doc.status !==
                                  'completed' &&
                                  doc.status !==
                                    'rejected' && (
                                    <button
                                      onClick={() =>
                                        indexDocument(
                                          doc
                                        )
                                      }
                                      disabled={
                                        isIndexing
                                      }
                                      title="Index"
                                      className="text-slate-500 hover:text-emerald-400 p-2 bg-transparent border-0 cursor-pointer disabled:opacity-40"
                                    >
                                      <Play
                                        size={
                                          14
                                        }
                                      />
                                    </button>
                                  )}

                                {doc.status ===
                                  'completed' && (
                                  <button
                                    onClick={() =>
                                      indexDocument(
                                        doc,
                                        true
                                      )
                                    }
                                    disabled={
                                      isIndexing
                                    }
                                    title="Reindex"
                                    className="text-slate-500 hover:text-amber-400 p-2 bg-transparent border-0 cursor-pointer disabled:opacity-40"
                                  >
                                    <RefreshCw
                                      size={
                                        14
                                      }
                                    />
                                  </button>
                                )}

                                <button
                                  onClick={() =>
                                    handleDeleteDocument(
                                      doc.id
                                    )
                                  }
                                  disabled={
                                    isIndexing
                                  }
                                  title="Delete"
                                  className="text-slate-600 hover:text-rose-400 p-2 bg-transparent border-0 cursor-pointer"
                                >
                                  <Trash2
                                    size={
                                      14
                                    }
                                  />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE DOCUMENT CARDS */}
              <div className="block sm:hidden space-y-3">
                {docs.length ===
                0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No legal documents
                    indexed.
                  </p>
                ) : (
                  docs.map(
                    (doc) => (
                      <div
                        key={doc.id}
                        className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 relative shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 truncate">
                            {doc.jurisdiction ===
                            'nigeria'
                              ? '🇳🇬 NIGERIA'
                              : '🇺🇸 US LAW'}
                          </span>

                          <span className="text-[10px] font-semibold text-slate-500 capitalize">
                            {doc.document_type}
                          </span>
                        </div>

                        <button
                          onClick={() =>
                            openPreview(
                              doc.id
                            )
                          }
                          className="text-left text-xs font-bold text-slate-200 pr-8 hover:text-blue-400"
                        >
                          {doc.title}
                        </button>

                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-[9px] font-bold uppercase border px-2 py-0.5 rounded-full',
                              doc.authority_level ===
                                'primary'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            )}
                          >
                            {doc.authority_level ||
                              'primary'}
                          </span>

                          {doc.current_status && (
                            <span className="text-[9px] text-slate-500">
                              {doc.current_status.replace(
                                /_/g,
                                ' '
                              )}
                            </span>
                          )}
                        </div>
