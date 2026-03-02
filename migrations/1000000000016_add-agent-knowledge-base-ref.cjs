/**
 * Migration: Add knowledge_base_ref to agents table
 *
 * Enables agents to declare a KB artifact reference for RAG retrieval at inference time.
 */

exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.addColumns('agents', {
    knowledge_base_ref: {
      type: 'varchar(255)',
      nullable: true,
    },
  });
};

exports.down = async (pgm) => {
  pgm.dropColumns('agents', ['knowledge_base_ref']);
};
