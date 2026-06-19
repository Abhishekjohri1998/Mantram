import BaseNode from './BaseNode';
export default function ConcatNode({ data, selected }) {
    return (
        <BaseNode data={data} selected={selected} icon="🔗" costClass="free" accentColor="#06b6d4"
            inputPorts={[{ id: 'clips', type: 'asset_list', label: 'Clips', required: true, multi: true }]}
            outputPorts={[{ id: 'video', type: 'video', label: 'Joined Video' }]}
        />
    );
}
