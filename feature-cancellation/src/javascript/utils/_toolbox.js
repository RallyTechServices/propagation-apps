Ext.define('Rally.technicalservices.Toolbox', {
    singleton: true,

    fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');

        var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            filters: [{
                property: 'TypePath',
                operator: 'contains',
                value: 'PortfolioItem/'
            }],
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }]
        });
        store.load({
            callback: function(records, operation, success){
                if (success){
                    var portfolioItemTypes = new Array(records.length);
                    _.each(records, function(d){
                        //Use ordinal to make sure the lowest level portfolio item type is the first in the array.
                        var idx = Number(d.get('Ordinal'));
                        portfolioItemTypes[idx] = d.get('TypePath');
                        //portfolioItemTypes.reverse();
                    });
                    deferred.resolve(portfolioItemTypes);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error loading Portfolio Item Types:  ' + error_msg);
                }
            }
        });
        return deferred.promise;
    },
    fetchPortfolioItemStateRefs: function(stateName){
      var deferred = Ext.create('Deft.Deferred');

      var store = Ext.create('Rally.data.wsapi.Store', {
          model: 'State',
          fetch: ['TypePath', 'TypeDef','Name'],
          filters: [{
             property: 'Name',
             value: stateName
          }]
      });
      store.load({
          callback: function(records, operation, success){
              if (success){
                  var stateHash = {};
                  Ext.Array.each(records, function(r){
                    var type = r.get('TypeDef') && r.get('TypeDef').TypePath.toLowerCase();
                    if (!stateHash[type]){
                        stateHash[type] = r.get('_ref');
                    }
                  });
                  deferred.resolve(stateHash);
              } else {
                  var error_msg = '';
                  if (operation && operation.error && operation.error.errors){
                      error_msg = operation.error.errors.join(',');
                  }
                  deferred.reject('Error loading Portfolio Item States:  ' + error_msg);
              }
          }
      });
      return deferred.promise;
    },
    fetchReleases: function(releaseName){
      var deferred = Ext.create('Deft.Deferred');

      var store = Ext.create('Rally.data.wsapi.Store', {
          model: 'Release',
          fetch: ['Project','Name'],
          filters: [{
             property: 'Name',
             value: releaseName
          }]
      });
      store.load({
          callback: function(records, operation, success){
              if (success){
                  var releaseHash = {};
                  Ext.Array.each(records, function(r){
                    var project = r.get('Project') && r.get('Project')._ref;
                    if (!releaseHash[project]){
                        releaseHash[project] = r.get('_ref');
                    }
                  });
                  deferred.resolve(releaseHash);
              } else {
                  var error_msg = '';
                  if (operation && operation.error && operation.error.errors){
                      error_msg = operation.error.errors.join(',');
                  }
                  deferred.reject('Error loading Releases:  ' + error_msg);
              }
          }
      });
      return deferred.promise;
    },

      fetchCompletedScheduleStates: function(){
          var deferred = Ext.create('Deft.Deferred');
          Rally.data.ModelFactory.getModel({
              type: 'HierarchicalRequirement',
              success: function(model) {
                  var field = model.getField('ScheduleState');
                  field.getAllowedValueStore().load({
                      callback: function(records, operation, success) {
                          if (success){
                              var values = [];
                              for (var i=0; i < records.length ; i++){
                                  if (values.length > 0 || records[i].get('StringValue') === "Completed"){
                                    values.push(records[i].get('StringValue'));
                                  }
                              }
                              deferred.resolve(values);
                          } else {
                              deferred.reject('Error loading ScheduleState values for User Story:  ' + operation.error.errors.join(','));
                          }
                      },
                      scope: this
                  });
              },
              failure: function() {
                  var error = "Could not load schedule states";
                  deferred.reject(error);
              }
          });
          return deferred.promise;
      }
});
