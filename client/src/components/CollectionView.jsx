import { useState } from 'react';
import FilterBar from './FilterBar';
import CardTable from './CardTable';
import CardDrawer from './CardDrawer';
import AddCardModal from './AddCardModal';

export default function CollectionView() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <FilterBar onAdd={() => setShowAdd(true)} />
      <div className="flex-1 overflow-auto">
        <CardTable />
      </div>
      <CardDrawer />
      {showAdd && <AddCardModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
