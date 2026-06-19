import { useState } from 'react';
import BaseNode from './BaseNode';
import { useCommandBus } from '../../state/useCommandBus';

const DEFAULT_ITEMS = [
    { id: '1', label: 'Scene 1: Introduction shot', checked: true },
    { id: '2', label: 'Scene 2: Dynamic product transition', checked: true },
    { id: '3', label: 'Scene 3: Detail zoom close-up', checked: false },
];

export default function ListNode({ data, selected }) {
    const listType = data?.params?.type || 'text';
    const { emit } = useCommandBus();
    const [newItemVal, setNewItemVal] = useState('');

    const items = data?.params?.items || DEFAULT_ITEMS;

    const toggleItem = (id) => {
        const newItems = items.map(item =>
            item.id === id ? { ...item, checked: !item.checked } : item
        );
        emit({
            type: 'update_params',
            payload: {
                nodeId: data.id,
                params: { ...data.params, items: newItems }
            },
            author: 'user'
        });
    };

    const handleAddItem = (e) => {
        if (e.key === 'Enter' && newItemVal.trim()) {
            const newItems = [
                ...items,
                { id: Date.now().toString(), label: newItemVal.trim(), checked: true }
            ];
            emit({
                type: 'update_params',
                payload: {
                    nodeId: data.id,
                    params: { ...data.params, items: newItems }
                },
                author: 'user'
            });
            setNewItemVal('');
        }
    };

    const deleteItem = (id) => {
        const newItems = items.filter(item => item.id !== id);
        emit({
            type: 'update_params',
            payload: {
                nodeId: data.id,
                params: { ...data.params, items: newItems }
            },
            author: 'user'
        });
    };

    const eventHandlers = {
        onMouseDown: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation(),
        onPointerDown: (e) => e.stopPropagation(),
    };

    const checkedCount = items.filter(i => i.checked).length;

    return (
        <BaseNode
            data={data}
            selected={selected}
            icon="📋"
            costClass="free"
            accentColor="#eab308"
            inputPorts={[{ id: 'items', type: 'asset_list', label: 'Items In', multi: true, required: false }]}
            outputPorts={[{ id: 'results', type: 'asset_list', label: 'Items Out' }]}
        >
            <div className="list-batch-node nodrag nowheel" {...eventHandlers}>
                <div className="list-batch-node__header">
                    <span className="list-batch-node__count-badge">{checkedCount} / {items.length} Active</span>
                </div>

                <div className="list-batch-node__items">
                    {items.map(item => (
                        <div key={item.id} className="list-batch-node__item">
                            <input
                                type="checkbox"
                                className="list-batch-node__checkbox"
                                checked={item.checked}
                                onChange={() => toggleItem(item.id)}
                            />
                            <span className={`list-batch-node__label ${!item.checked ? 'list-batch-node__label--disabled' : ''}`}>
                                {item.label}
                            </span>
                            <button className="list-batch-node__delete-item" onClick={() => deleteItem(item.id)}>✕</button>
                        </div>
                    ))}
                </div>

                <input
                    type="text"
                    className="list-batch-node__add-input"
                    placeholder="＋ Add list item..."
                    value={newItemVal}
                    onChange={e => setNewItemVal(e.target.value)}
                    onKeyDown={handleAddItem}
                />
            </div>
        </BaseNode>
    );
}
