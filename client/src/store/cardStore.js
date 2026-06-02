import { create } from 'zustand';
import axios from 'axios';

const useCardStore = create((set, get) => ({
  cards: [],
  summary: null,
  selectedCard: null,
  drawerOpen: false,
  filters: {
    sport: '',
    brand: '',
    graded: '',
    grade: '',
    raw_condition: '',
    status: 'owned',
    player_name: ''
  },
  loading: false,

  setFilters: (filters) => set({ filters }),

  setSelectedCard: (card) => set({ selectedCard: card, drawerOpen: true }),

  closeDrawer: () => set({ drawerOpen: false, selectedCard: null }),

  fetchCards: async () => {
    set({ loading: true });
    try {
      const { filters } = get();
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const res = await axios.get('/api/cards', { params });
      set({ cards: res.data });
    } finally {
      set({ loading: false });
    }
  },

  fetchSummary: async () => {
    const res = await axios.get('/api/cards/summary');
    set({ summary: res.data });
  },

  createCard: async (data) => {
    console.log('[cardStore] createCard → POST /api/cards', data);
    try {
      const res = await axios.post('/api/cards', data);
      console.log('[cardStore] createCard success:', res.data);
      await Promise.all([get().fetchCards(), get().fetchSummary()]);
      return res.data;
    } catch (err) {
      console.error('[cardStore] createCard error:', err.response?.status, err.response?.data || err.message);
      throw err;
    }
  },

  updateCard: async (id, data) => {
    const res = await axios.put(`/api/cards/${id}`, data);
    set(state => ({
      cards: state.cards.map(c => c.id === id ? res.data : c),
      selectedCard: state.selectedCard?.id === id ? res.data : state.selectedCard
    }));
    get().fetchSummary();
    return res.data;
  },

  deleteCard: async (id) => {
    await axios.delete(`/api/cards/${id}`);
    set(state => ({ cards: state.cards.filter(c => c.id !== id) }));
    get().fetchSummary();
  },

  sellCard: async (id, saleData) => {
    const res = await axios.post(`/api/cards/${id}/sell`, saleData);
    await Promise.all([get().fetchCards(), get().fetchSummary()]);
    return res.data;
  }
}));

export default useCardStore;
