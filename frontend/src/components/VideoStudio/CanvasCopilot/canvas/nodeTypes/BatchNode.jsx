import BaseNode from './BaseNode';
export default function BatchNode({ data, selected }) {
    return (
        <BaseNode data={data} selected={selected} icon="🔁" costClass="free" accentColor="#06b6d4"
            inputPorts={[
                { id: 'items', type: 'asset_list', label: 'Items List', required: true },
                { id: 'template', type: 'text', label: 'Prompt Template', required: true }
            ]}
            outputPorts={[{ id: 'results', type: 'asset_list', label: 'Results' }]}
        />
    );
}
